import { z } from 'zod';
export const vendors = ['ga4', 'posthog', 'mixpanel'];
export const Expected = z.enum(['any', ...vendors]);
const Evidence = z.object({ vendor: z.enum(vendors), kind: z.enum(['script', 'request', 'response']), endpoint: z.string().max(300), status: z.number().int().min(0).max(599).optional(), accepted: z.boolean().optional() }).strict().superRefine((value, context) => {
  if (value.kind === 'response' && value.status === undefined || value.kind !== 'response' && (value.status !== undefined || value.accepted !== undefined) || value.accepted === true && (!value.status || value.status < 200 || value.status >= 300)) context.addIssue({ code: 'custom', message: 'Response evidence requires a status and acceptance requires HTTP 2xx.' });
});
export const Report = z.object({ version: z.literal(1), source: z.enum(['browser', 'static', 'har']), target: z.string().max(300), checkedAt: z.string().datetime(), expected: Expected, evidence: z.array(Evidence).max(300), notes: z.array(z.string().max(400)).max(20), templateTest: z.object({ status: z.number().int().min(0).max(599), accepted: z.boolean() }).strict().optional() }).strict();
export function publicLabel(raw) { const u = new URL(raw); return `${u.protocol}//${u.host}${u.pathname === '/' ? '/' : '/[path]'}`; }
export function detect(raw, collection = false) {
  let u; try { u = new URL(raw); } catch { return null; }
  const h = u.hostname; const p = u.pathname;
  if ((h === 'google-analytics.com' || h.endsWith('.google-analytics.com')) && /\/(g\/collect|collect|mp\/collect)$/.test(p)) return 'ga4';
  if (!collection && h === 'www.googletagmanager.com' && p === '/gtag/js') return 'ga4';
  if ((h === 'posthog.com' || h.endsWith('.posthog.com')) && /^\/(capture\/?|e\/?|batch\/?|i\/v0\/e\/?)$/.test(p)) return 'posthog';
  if (!collection && (h.endsWith('.posthog.com') || h === 'posthog.com') && /\.js$/.test(p)) return 'posthog';
  if ((h === 'api.mixpanel.com' || h === 'api-eu.mixpanel.com' || h === 'api-in.mixpanel.com') && /^\/track\/?$/.test(p)) return 'mixpanel';
  if (!collection && h === 'cdn.mxpnl.com' && /\.js$/.test(p)) return 'mixpanel';
  return null;
}
export function acceptedResponse(vendor, status, body) {
  if (status < 200 || status >= 300) return false;
  if (vendor === 'mixpanel') { try { const v = JSON.parse(body); return v === 1 || v.status === 1; } catch { return false; } }
  if (vendor === 'posthog') { try { const v = JSON.parse(body); return v.status === 1 || v === 1; } catch { return false; } }
  return true; // GA4 HTTP acceptance does not confirm validation or downstream receipt.
}
export function results(report) {
  return vendors.map(vendor => {
    const evidence = report.evidence.filter(e => e.vendor === vendor);
    const requests = evidence.filter(e => e.kind === 'request').length;
    const responses = evidence.filter(e => e.kind === 'response');
    const accepted = responses.some(e => e.accepted === true);
    const rejected = responses.some(e => e.accepted === false);
    const required = report.expected === vendor;
    const status = rejected || (required && evidence.length === 0 && report.source !== 'static') ? 'fail' : accepted ? 'pass' : 'unknown';
    return { vendor, status, detected: evidence.length > 0, requests, accepted: accepted && !rejected, receipt: 'unknown', explanation: rejected ? 'A collection request received a rejection or a negative provider response. Check consent, project key and endpoint.' : accepted ? 'Provider response accepted. Downstream ingestion and dashboard receipt remain unknown.' : requests ? 'Collection request observed, but no accepted provider response was recorded.' : evidence.length ? 'SDK reference detected. No collection request was observed; check consent and run the browser CLI.' : 'No evidence in this observation. Consent, delayed loading or a custom proxy may hide this vendor.', fix: vendor === 'ga4' ? 'Set NEXT_PUBLIC_GA4_ID and server-only GA4_API_SECRET for your template.' : vendor === 'posthog' ? 'Set POSTHOG_KEY and POSTHOG_REGION=us or eu for your template.' : 'Set server-only MIXPANEL_TOKEN and MIXPANEL_REGION=us or eu for your template.' };
  });
}
export function exitCode(report) {
  if (report.templateTest && !report.templateTest.accepted) return 1;
  const rows = results(report).filter(r => report.expected === 'any' ? r.detected : r.vendor === report.expected);
  if (rows.some(r => r.status === 'fail')) return 1;
  if (!rows.length || rows.some(r => r.status === 'unknown')) return 2;
  return 0;
}
export function importReport(input, expected = 'any') {
  Expected.parse(expected);
  if (input?.version === 1) {
    const parsed = Report.parse({ ...input, expected });
    return { ...parsed, target: /^https?:/.test(parsed.target) ? publicLabel(parsed.target) : 'Imported report', evidence: parsed.evidence.map(e => ({ ...e, endpoint: publicLabel(e.endpoint) })), notes: ['Imported evidence is operator-supplied, not independently verified. Downstream receipt remains unknown.'] };
  }
  const har = z.object({ log: z.object({ entries: z.array(z.object({ request: z.object({ url: z.string().max(10000) }), response: z.object({ status: z.number().int().min(0).max(599), content: z.object({ text: z.string().max(100000).optional(), encoding: z.string().optional() }).optional() }) })).max(5000) }) }).parse(input);
  const evidence = [];
  for (const entry of har.log.entries) {
    const vendor = detect(entry.request.url, true); if (!vendor) continue;
    const endpoint = publicLabel(entry.request.url);
    evidence.push({ vendor, kind: 'request', endpoint });
    const { status, content } = entry.response;
    const body = content?.encoding === 'base64' ? undefined : content?.text;
    if (status > 0) evidence.push({ vendor, kind: 'response', endpoint, status, ...(body !== undefined || vendor === 'ga4' ? { accepted: acceptedResponse(vendor, status, body) } : status >= 400 ? { accepted: false } : {}) });
    if (evidence.length >= 300) break;
  }
  return Report.parse({ version: 1, source: 'har', target: 'Imported HAR', checkedAt: new Date().toISOString(), expected, evidence: evidence.slice(0, 300), notes: ['Imported evidence is supplied by the operator, not independently verified. Request bodies, headers, queries and user identifiers are discarded.'] });
}
