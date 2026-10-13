import puppeteer from 'puppeteer';
import { detect, publicLabel, acceptedResponse, Report } from './report.mjs';
/** @param {string} target @param {{ expected?: string, wait?: number, testEvents?: boolean, token?: string, launch?: import("puppeteer").LaunchOptions, fixtureOrigins?: string[] }} options */
export async function doctor(target, { expected = 'any', wait = 3000, testEvents = false, token, launch = {}, fixtureOrigins = [] } = {}) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) URL without credentials.');
  if (testEvents && (!token || !process.env.TRACKFAST_TEMPLATE_ORIGIN || new URL(process.env.TRACKFAST_TEMPLATE_ORIGIN).origin !== url.origin)) throw new Error('Own-template test events require a token and a matching TRACKFAST_TEMPLATE_ORIGIN.');
  const evidence = []; let templateTest; const notes = ['Observation-only navigation; site scripts can emit their normal events. No consent buttons are clicked. Downstream receipt cannot be verified.'];
  const browser = await puppeteer.launch({ headless: true, ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}), ...launch });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    let requestCount = 0; const pending = [];
    const vendorOf = raw => detect(raw, true) || (fixtureOrigins.some(origin => raw.startsWith(`${origin}/`)) ? ({ '/ga4': 'ga4', '/posthog': 'posthog', '/mixpanel': 'mixpanel' }[new URL(raw).pathname]) : null);
    page.on('request', req => {
      if (++requestCount > 250 || !/^https?:/.test(req.url()) && !/^(data:|blob:|about:)/.test(req.url())) { void req.abort(); return; }
      const vendor = vendorOf(req.url());
      if (vendor && evidence.length < 280) evidence.push({ vendor, kind: 'request', endpoint: publicLabel(req.url()) });
      else { const sdk = detect(req.url()); if (sdk && evidence.length < 280) evidence.push({ vendor: sdk, kind: 'script', endpoint: publicLabel(req.url()) }); }
      void req.continue();
    });
    page.on('response', response => {
      const vendor = vendorOf(response.url()); if (!vendor) return;
      const status = response.status();
      const item = { vendor, kind: 'response', endpoint: publicLabel(response.url()), status, ...(status >= 400 ? { accepted: false } : vendor === 'ga4' ? { accepted: acceptedResponse(vendor, status) } : {}) };
      if (evidence.length < 300) evidence.push(item);
      pending.push((async () => { let body; try { if (Number(response.headers()['content-length'] || 0) <= 100000) body = (await response.text()).slice(0, 100000); } catch { /* Response body unavailable. */ }
        if (body !== undefined) item.accepted = acceptedResponse(vendor, status, body);
      })());
    });
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!response || response.status() >= 400) throw new Error('Target page failed to load. Check the URL and access permissions.');
    if (testEvents) {
      if (new URL(page.url()).origin !== url.origin) throw new Error('Refusing to send an operator token after a cross-origin redirect.');
      const endpoint = new URL('/api/track', url.origin);
      const healthResponse = await fetch(endpoint, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      const health = healthResponse.ok ? await healthResponse.json() : null;
      if (health?.service !== 'trackfast-api') throw new Error('Test events are only supported by your own Trackfast template.');
      const testResponse = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ event: 'feature_used', properties: { feature: 'doctor-test', location: 'cli' } }), signal: AbortSignal.timeout(10000), redirect: 'error' });
      const testBody = await testResponse.json();
      const result = { status: testResponse.status, accepted: testResponse.ok && testBody.success === true };
      templateTest = result;
      notes.push(`Explicit own-template test event returned HTTP ${result.status}. Proxy response alone does not prove vendor receipt.`);
    }
    await new Promise(resolve => setTimeout(resolve, wait));
    let observationTimer;
    try { await Promise.race([Promise.allSettled(pending), new Promise(resolve => { observationTimer = setTimeout(resolve, 3000); })]); }
    finally { clearTimeout(observationTimer); }
    return Report.parse({ version: 1, source: 'browser', target: publicLabel(url.href), checkedAt: new Date().toISOString(), expected, evidence, notes, ...(templateTest ? { templateTest } : {}) });
  } finally { await browser.close(); }
}
