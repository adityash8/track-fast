import { safeFetch } from './safe-fetch';
import { detect, publicLabel, Report } from '../../cli/report.mjs';

export async function inspectWebsite(target: string, expected: 'any' | 'ga4' | 'posthog' | 'mixpanel') {
  const deadline = Date.now() + 20000;
  const page = await safeFetch(target, deadline);
  const evidence: { vendor: 'ga4' | 'posthog' | 'mixpanel'; kind: 'script'; endpoint: string }[] = [];
  const notes = ['Static inspection reads HTML and at most four scripts. It does not execute JavaScript, accept consent or send events. SDK references do not prove tracking works.'];
  const scan = (text: string, source: string) => {
    // Recognizable references only; never infer provider health from a keyword.
    for (const raw of text.match(/https?:\/\/[^\s"'<>\\)]+/g) || []) {
      const vendor = detect(raw); if (vendor && !evidence.some(e => e.vendor === vendor && e.endpoint === publicLabel(source))) evidence.push({ vendor, kind: 'script', endpoint: publicLabel(source) });
    }
    for (const [vendor, pattern] of [['posthog', /posthog\.(init|capture)\s*\(/], ['mixpanel', /mixpanel\.(init|track)\s*\(/], ['ga4', /gtag\s*\(\s*['"]config['"]\s*,\s*['"]G-/]] as const) {
      if (pattern.test(text) && !evidence.some(e => e.vendor === vendor && e.endpoint === publicLabel(source))) evidence.push({ vendor, kind: 'script', endpoint: publicLabel(source) });
    }
  };
  scan(page.text, page.url);
  const scripts = [...page.text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].slice(0, 4);
  for (const script of scripts) {
    try { const loaded = await safeFetch(new URL(script[1].replace(/&amp;/g, '&'), page.url).href, deadline); scan(loaded.text, loaded.url); }
    catch { notes.push('A referenced script could not be inspected safely. Use the browser CLI for execution evidence.'); }
  }
  return Report.parse({ version: 1, source: 'static', target: publicLabel(page.url), checkedAt: new Date().toISOString(), expected, evidence, notes });
}
