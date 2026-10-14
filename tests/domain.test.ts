import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateEvent, trackEvent } from '../src/lib/event-schemas';
import { isPublicAddress, resolvePublic } from '../src/lib/safe-fetch';
import { forwardEvent } from '../src/lib/forward';
import { readJSON } from '../src/lib/bounded-body';
import { detect, acceptedResponse, importReport, results, exitCode } from '../cli/report.mjs';
import { GET, POST } from '../src/app/api/track/route';

test('schema rejects drift, invalid cents, non-finite amounts and bad currencies', () => {
  for (const amount of [-1, 0, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => validateEvent('payment_completed', { amount, currency: 'USD' }));
  assert.throws(() => validateEvent('pageview', { path: '/', injected: 'secret' }));
  assert.throws(() => validateEvent('__proto__', {}));
  assert.throws(() => validateEvent('payment_completed', { amount: 100, currency: 'usd' }));
  assert.throws(() => validateEvent('user_signed_in', { email: 'invalid', method: 'google' }));
  assert.deepEqual(validateEvent('payment_completed', { amount: 100 }), { amount: 100, currency: 'USD' });
});
test('generation is deterministic and typed invalid helpers never call a provider', async () => {
  const before = readFileSync('src/lib/event-schemas.ts', 'utf8');
  execFileSync('node_modules/.bin/tsx', ['scripts/gen-schema.ts']);
  assert.equal(readFileSync('src/lib/event-schemas.ts', 'utf8'), before);
  // Runtime drift is still rejected if a JavaScript caller bypasses types.
  // @ts-expect-error intentionally wrong event properties
  assert.equal((await trackEvent('feature_used', { feature: 3 })).success, false);
});
test('SSRF rejects private IPv4, mapped IPv6, reserved space, credentials, ports and mixed DNS answers', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254', '172.20.0.1', '192.168.0.1', '198.19.0.1', '::1', '::ffff:8.8.8.8', 'fd00::1', '2001:db8::1', '2002:7f00:1::']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  for (const url of ['http://127.1', 'http://2130706433', 'http://[::1]', 'https://user:pass@example.com', 'file:///tmp/test', 'http://example.com:8080']) await assert.rejects(resolvePublic(url));
  const mixed = async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }];
  await assert.rejects(resolvePublic('https://example.com', mixed as never));
});
test('detector matches collection host and endpoint, not lookalike or config URL', () => {
  assert.equal(detect('https://www.google-analytics.com/g/collect?secret=123', true), 'ga4');
  assert.equal(detect('https://google-analytics.com.evil.example/g/collect', true), null);
  assert.equal(detect('https://us.i.posthog.com/capture/', true), 'posthog');
  assert.equal(detect('https://us.i.posthog.com/capture/other', true), null);
  assert.equal(detect('https://api.mixpanel.com/track', true), 'mixpanel');
  assert.equal(detect('https://www.googletagmanager.com/gtag/js', true), null);
});
test('HTTP success is not a successful Mixpanel/PostHog provider body', () => {
  assert.equal(acceptedResponse('mixpanel', 200, '0'), false);
  assert.equal(acceptedResponse('posthog', 200, '{"status":0}'), false);
  assert.equal(acceptedResponse('mixpanel', 200, '{"status":1}'), true);
  assert.equal(acceptedResponse('posthog', 200, '{"status":1}'), true);
  assert.equal(acceptedResponse('ga4', 204, ''), true);
  assert.equal(acceptedResponse('ga4', 403, ''), false);
});
test('HAR import strips credentials and distinguishes missing response from denial', () => {
  const har = { log: { entries: [
    { request: { url: 'https://api.mixpanel.com/track?token=private', headers: [{ value: 'private' }], postData: { text: 'private' } }, response: { status: 200, content: { text: '0' } } },
    { request: { url: 'https://www.google-analytics.com/g/collect' }, response: { status: 0 } },
  ] } };
  const report = importReport(har, 'mixpanel');
  assert.equal(JSON.stringify(report).includes('private'), false);
  assert.equal(results(report).find(r => r.vendor === 'mixpanel')?.status, 'fail');
  assert.equal(exitCode(report), 1);
  assert.equal(exitCode({ ...report, expected: 'ga4' }), 2);
  assert.equal(exitCode({ ...report, expected: 'posthog' }), 1);
  assert.equal(exitCode({ ...report, source: 'static', evidence: [], expected: 'posthog' }), 2);
  assert.throws(() => importReport({ log: { entries: [] } }, 'invalid'));
});
test('imported reports are bounded and endpoint queries/notes are sanitized', () => {
  const report = importReport({ version: 1, source: 'browser', target: 'https://example.com/user-email?private', expected: 'any', checkedAt: new Date().toISOString(), evidence: [{ vendor: 'ga4', kind: 'request', endpoint: 'https://www.google-analytics.com/g/collect?private' }], notes: ['private'] });
  assert.equal(JSON.stringify(report).includes('private'), false);
  assert.equal(JSON.stringify(report).includes('user-email'), false);
  assert.throws(() => importReport({ ...report, evidence: Array(301).fill(report.evidence[0]) }));
});
test('forwarding sets anonymous identity, hashes email, reports partial/rejected/network failures', async () => {
  const env = { POSTHOG_KEY: 'fixture-project', NEXT_PUBLIC_GA4_ID: 'fixture-id', GA4_API_SECRET: 'fixture-secret', MIXPANEL_TOKEN: 'fixture-token' };
  const bodies: string[] = [];
  const send = (async (url: string | URL | Request, options: RequestInit) => { bodies.push(String(options.body)); if (String(url).includes('google-analytics')) return new Response('', { status: 403 }); if (String(url).includes('mixpanel')) throw new Error('Provider failure'); return new Response('{"status":1}'); }) as typeof fetch;
  const responses = await forwardEvent('user_signed_up', { email: 'User@example.com', plan: 'free', userId: 'caller-owner', distinct_id: 'caller-owner' }, env, send);
  assert.equal(responses.filter(r => r.accepted).length, 1);
  assert.equal(bodies.join('').includes('User@example.com'), false);
  assert.equal(bodies.join('').includes('caller-owner'), false);
  assert.equal(responses.every(r => r.receipt === 'unknown'), true);
  assert.deepEqual(await forwardEvent('pageview', { path: '/' }, {}, send), []);
});
test('health works without body; authorization cannot be spoofed; invalid input never forwards', async () => {
  const prior = process.env.TRACKFAST_OPERATOR_TOKEN;
  process.env.TRACKFAST_OPERATOR_TOKEN = 'fixture-operator';
  try {
    assert.equal((await GET()).status, 200);
    assert.equal((await POST(new Request('http://local/api/track', { method: 'POST', headers: { 'x-trackfast-validated': 'true' }, body: '{}' }))).status, 401);
    assert.equal((await POST(new Request('http://local/api/track', { method: 'POST', headers: { authorization: 'Bearer éééééééééééééééé' }, body: '{}' }))).status, 401);
    assert.equal((await POST(new Request('http://local/api/track', { method: 'POST', headers: { authorization: 'Bearer fixture-operator' }, body: JSON.stringify({ event: 'unknown', properties: {} }) }))).status, 400);
  } finally { if (prior === undefined) delete process.env.TRACKFAST_OPERATOR_TOKEN; else process.env.TRACKFAST_OPERATOR_TOKEN = prior; }
});
test('streamed request body cannot bypass size limit', async () => {
  await assert.rejects(readJSON(new Request('http://local', { method: 'POST', body: JSON.stringify({ value: 'x'.repeat(100) }) }), 20));
});

test('gateway returns failure for no providers or all rejected providers and accepts partial success', async () => {
  const keys = ['TRACKFAST_OPERATOR_TOKEN', 'POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_GA4_ID', 'GA4_API_SECRET', 'MIXPANEL_TOKEN'] as const;
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const request = () => new Request('http://local/api/track', { method: 'POST', headers: { authorization: 'Bearer fixture-operator' }, body: JSON.stringify({ event: 'feature_used', properties: { feature: 'fixture' } }) });
  try {
    for (const key of keys) delete process.env[key];
    process.env.TRACKFAST_OPERATOR_TOKEN = 'fixture-operator';
    assert.equal((await POST(request())).status, 503);
    process.env.POSTHOG_KEY = 'fixture-project';
    globalThis.fetch = async () => new Response('{"status":0}', { status: 200 });
    assert.equal((await POST(request())).status, 502);
    globalThis.fetch = async () => { throw new Error('Network failure'); };
    assert.equal((await POST(request())).status, 502);
    globalThis.fetch = async () => new Response('{"status":1}');
    assert.equal((await POST(request())).status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
  }
});

test('report import cannot call a rejection an accepted response or attach acceptance to a script', () => {
  const base = { version: 1, source: 'browser', target: 'https://example.com', expected: 'any', checkedAt: new Date().toISOString(), notes: [] };
  for (const invalid of [{ vendor: 'ga4', kind: 'response', endpoint: 'https://www.google-analytics.com/g/collect', status: 403, accepted: true }, { vendor: 'posthog', kind: 'script', endpoint: 'https://us.i.posthog.com/static.js', accepted: true }]) assert.throws(() => importReport({ ...base, evidence: [invalid] }));
  const report = importReport({ ...base, evidence: [] });
  assert.equal(exitCode({ ...report, templateTest: { status: 401, accepted: false } }), 1);
});
