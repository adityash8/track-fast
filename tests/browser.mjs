import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const base = process.env.TRACKFAST_TEST_URL || 'http://localhost:3000';
const browser = await puppeteer.launch({ headless: true, ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}) });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(base, { waitUntil: 'networkidle0' });
  assert.match(await page.$eval('main', node => node.textContent), /No site inspected yet/);
  await page.type('#url', 'http://127.0.0.1');
  await page.click('button[type=submit]');
  await page.waitForSelector('[role=alert]');
  assert.match(await page.$eval('[role=alert]', node => node.textContent), /blocked/);
  assert.equal(await page.$eval('#url', node => node.value), 'http://127.0.0.1');
  const har = { log: { entries: [{ request: { url: 'https://api.mixpanel.com/track?token=sensitive' }, response: { status: 200, content: { text: '1' } } }] } };
  const file = await page.$('#report-file');
  // Upload a virtual file with Chrome DevTools protocol; no external provider traffic.
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const temp = await mkdtemp(`${tmpdir()}/trackfast-browser-`);
  try {
    await writeFile(`${temp}/fixture.har`, JSON.stringify(har));
    await file.uploadFile(`${temp}/fixture.har`);
    await page.waitForSelector('.status.pass');
    assert.match(await page.$eval('.vendor-list', node => node.textContent), /Downstream receiptUnknown/);
    assert.equal((await page.$eval('.vendor-list', node => node.textContent)).includes('sensitive'), false);
    await page.select('#vendor', 'mixpanel');
    const downloads = await page.target().createCDPSession();
    await downloads.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: temp });
    const buttons = await page.$$('button');
    for (const button of buttons) if ((await button.evaluate(node => node.textContent)) === 'Export JSON') await button.click();
    await new Promise(resolve => setTimeout(resolve, 500));
    const { readFile } = await import('node:fs/promises');
    const saved = JSON.parse(await readFile(`${temp}/trackfast-report.json`, 'utf8'));
    assert.equal(saved.expected, 'mixpanel'); assert.equal(saved.evidence.length, 2);
    await page.screenshot({ path: `${temp}/desktop.png`, fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${temp}/mobile.png`, fullPage: true });
    console.log('PASS first-run, SSRF recovery, local HAR import, evidence privacy, expected vendor, JSON persistence, desktop/mobile overflow');
  } finally { await rm(temp, { recursive: true }); }
  const health = await page.evaluate(async () => { const response = await fetch('/api/track'); return { status: response.status, body: await response.json() }; });
  assert.equal(health.status, 200); assert.equal(health.body.service, 'trackfast-api');
  const denied = await page.evaluate(async () => (await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
  assert.ok([401, 503].includes(denied)); assert.deepEqual(errors, []);
  console.log('PASS GET health, denied anonymous events, no browser runtime errors');
} finally { await browser.close(); }
