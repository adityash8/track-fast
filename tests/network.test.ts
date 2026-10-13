import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { safeFetch } from '../src/lib/safe-fetch';
import { inspectWebsite } from '../src/lib/inspect';
type FixtureResponse = PassThrough & { statusCode: number; headers: object };
type FixtureOptions = { lookup: (host: string, options: object, callback: (error: unknown, address: string) => void) => void };
type FixtureCallback = (response: FixtureResponse) => void;

test('fetch pins DNS, follows bounded public redirects and rejects a redirect into private space', async () => {
  mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  let calls = 0; const pins: string[] = [];
  mock.method(http, 'request', (_url: URL, options: FixtureOptions, callback: FixtureCallback) => {
    options.lookup('example.com', {}, (_error: unknown, address: string) => pins.push(address));
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    request.destroy = () => { request.emit('close'); };
    request.end = () => { calls++; const response = new PassThrough() as PassThrough & { statusCode: number; headers: object };
      response.statusCode = 302; response.headers = { location: 'http://127.0.0.1/secret' }; callback(response); request.emit('close'); };
    return request;
  });
  try { await assert.rejects(safeFetch('http://example.com'), /blocked/); assert.equal(calls, 1); assert.deepEqual(pins, ['8.8.8.8']); }
  finally { mock.restoreAll(); }
});
test('static inspector reads real text responses, limits script count and leaves delivery unknown', async () => {
  mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const visited: string[] = [];
  mock.method(https, 'request', (url: URL, _options: FixtureOptions, callback: FixtureCallback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    request.destroy = () => { request.emit('close'); };
    request.end = () => { visited.push(url.pathname); const response = new PassThrough() as PassThrough & { statusCode: number; headers: object };
      response.statusCode = 200; response.headers = { 'content-type': url.pathname === '/' ? 'text/html' : 'text/javascript' };
      callback(response);
      response.end(url.pathname === '/' ? Array.from({ length: 8 }, (_, i) => `<script src="/script-${i}.js"></script>`).join('') : 'posthog.init("fixture");'); request.emit('close'); };
    return request;
  });
  try {
    const report = await inspectWebsite('https://example.com', 'posthog');
    assert.equal(visited.length, 5); assert.equal(report.source, 'static');
    assert.ok(report.evidence.length > 0); assert.equal(report.evidence.every(e => e.kind === 'script'), true);
  } finally { mock.restoreAll(); }
});
test('fetch rejects oversized response and bounds redirect loops', async () => {
  mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  let redirect = false; let calls = 0;
  mock.method(http, 'request', (_url: URL, _options: FixtureOptions, callback: FixtureCallback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    request.destroy = () => { request.emit('close'); };
    request.end = () => { calls++; const response = new PassThrough() as PassThrough & { statusCode: number; headers: object };
      response.statusCode = redirect ? 302 : 200; response.headers = redirect ? { location: 'http://example.com/loop' } : { 'content-type': 'text/html' };
      callback(response); if (!redirect) response.end('x'.repeat(750001)); request.emit('close'); };
    return request;
  });
  try {
    await assert.rejects(safeFetch('http://example.com'), /750 KB/);
    redirect = true; calls = 0; await assert.rejects(safeFetch('http://example.com'), /redirect/); assert.equal(calls, 5);
  } finally { mock.restoreAll(); }
});
