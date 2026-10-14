import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { doctor } from '../cli/doctor.mjs';
import { exitCode, results } from '../cli/report.mjs';

test('operator token is refused before navigation when the target is not the configured template origin', async () => {
  const prior = process.env.TRACKFAST_TEMPLATE_ORIGIN;
  process.env.TRACKFAST_TEMPLATE_ORIGIN = 'https://owned.example';
  try { await assert.rejects(doctor('https://other.example', { testEvents: true, token: 'fixture-token' }), /matching TRACKFAST_TEMPLATE_ORIGIN/); }
  finally { if (prior === undefined) delete process.env.TRACKFAST_TEMPLATE_ORIGIN; else process.env.TRACKFAST_TEMPLATE_ORIGIN = prior; }
});

test('local fixture observes actual accepted and denied responses without injecting an event', async () => {
  let posts = 0;
  const server = createServer((request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(`<script>fetch('/posthog',{method:'POST',body:'fixture'});fetch('/mixpanel',{method:'POST',body:'fixture'});fetch('/ga4',{method:'POST',body:'fixture'});</script>`); }
    else { if (request.method === 'POST') posts++; response.setHeader('Content-Type', 'application/json'); if (request.url === '/mixpanel') response.end('0'); else if (request.url === '/ga4') { response.statusCode = 204; response.end(); } else response.end('{"status":1}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    // Internal test-only attribution lets a local fixture exercise real HTTP responses without provider credits.
    const report = await doctor(origin, { expected: 'posthog', wait: 500, fixtureOrigins: [origin] });
    assert.equal(posts, 3); assert.equal(exitCode(report), 0);
    assert.equal(results(report).find(r => r.vendor === 'mixpanel')?.status, 'fail');
    assert.equal(exitCode({ ...report, expected: 'mixpanel' }), 1);
    const unclassified = await doctor(origin, { expected: 'posthog', wait: 500 });
    assert.equal(exitCode(unclassified), 1); // Arbitrary first-party requests are never manufactured vendor evidence.
    assert.equal(posts, 6);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('browser records a rejected response before its body completes and CLI exits 1', async () => {
  const rejectedResponses: ServerResponse[] = [];
  const server = createServer((request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(`<script>fetch('/mixpanel?accepted',{method:'POST'});fetch('/mixpanel?rejected',{method:'POST'});</script>`); }
    else if (request.url === '/mixpanel?rejected') {
      rejectedResponses.push(response);
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.write('0'); // Keep the body open past Doctor's three-second observation window.
    } else { response.setHeader('Content-Type', 'application/json'); response.end('1'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const directory = await mkdtemp(`${tmpdir()}/trackfast-slow-body-`);
  try {
    const report = await doctor(origin, { expected: 'mixpanel', wait: 500, fixtureOrigins: [origin] });
    assert.equal(rejectedResponses.length, 1);
    assert.equal(rejectedResponses[0].writableEnded, false);
    const responses = report.evidence.filter(item => item.kind === 'response' && item.vendor === 'mixpanel');
    assert.equal(responses.length, 2);
    assert.deepEqual(responses.sort((a, b) => (a.status ?? 0) - (b.status ?? 0)).map(item => [item.status, item.accepted]), [[200, true], [403, false]]);
    assert.equal(results(report).find(row => row.vendor === 'mixpanel')?.status, 'fail');
    assert.equal(results(report).find(row => row.vendor === 'mixpanel')?.receipt, 'unknown');
    const path = `${directory}/report.json`;
    await writeFile(path, JSON.stringify(report));
    const run = await new Promise<{code:number;stdout:string}>(resolve => execFile(process.execPath, ['cli/bin.mjs', 'doctor', '--import', path, '--expect', 'mixpanel', '--json'], (error, stdout) => resolve({ code: error ? Number(error.code) : 0, stdout })));
    assert.equal(run.code, 1);
    assert.equal(JSON.parse(run.stdout).evidence.some((item:{status:number;accepted:boolean}) => item.status === 403 && item.accepted === false), true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true });
  }
});
test('CLI JSON and status reflect actual imported evidence and protect existing output', async () => {
  const directory = await mkdtemp(`${tmpdir()}/trackfast-test-`);
  const path = `${directory}/har.json`;
  await writeFile(path, JSON.stringify({ log: { entries: [{ request: { url: 'https://www.google-analytics.com/g/collect' }, response: { status: 204 } }] } }));
  const run = (args: string[]) => new Promise<{ code: number; stdout: string }>(resolve => execFile(process.execPath, ['cli/bin.mjs', ...args], (error, stdout) => resolve({ code: error ? Number(error.code) : 0, stdout })));
  try {
    const pass = await run(['doctor', '--import', path, '--expect', 'ga4', '--json']);
    assert.equal(pass.code, 0); assert.equal(JSON.parse(pass.stdout).source, 'har');
    assert.equal((await run(['doctor', '--import', path, '--expect', 'posthog'])).code, 1);
    assert.equal((await run(['doctor', '--import', path, '--output', path])).code, 3);
    assert.equal((await run(['doctor', '--wait', '999999', 'https://example.com'])).code, 3);
  } finally { await rm(directory, { recursive: true }); }
});
test('mixed accepted and rejected collection responses fail the vendor and CLI without claiming receipt', async () => {
  const directory = await mkdtemp(`${tmpdir()}/trackfast-mixed-`);
  const path = `${directory}/mixed.har`;
  const har = { log: { entries: [
    { request: { url: 'https://api.mixpanel.com/track?event=first' }, response: { status: 200, content: { text: '1' } } },
    { request: { url: 'https://api.mixpanel.com/track?event=second' }, response: { status: 403, content: { text: '0' } } },
  ] } };
  await writeFile(path, JSON.stringify(har));
  try {
    const run = await new Promise<{code:number;stdout:string}>(resolve => execFile(process.execPath, ['cli/bin.mjs','doctor','--import',path,'--expect','mixpanel','--json'], (error,stdout) => resolve({code:error?Number(error.code):0,stdout})));
    const report = JSON.parse(run.stdout);
    assert.equal(report.evidence.filter((item:{kind:string}) => item.kind === 'response').length, 2);
    const mixpanel = results(report).find(row => row.vendor === 'mixpanel');
    assert.equal(mixpanel?.status, 'fail');
    assert.equal(mixpanel?.accepted, false);
    assert.equal(mixpanel?.receipt, 'unknown');
    assert.equal(run.code, 1);
  } finally { await rm(directory, { recursive: true }); }
});
