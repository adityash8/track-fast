import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateEvent } from '@/lib/event-schemas';
import { forwardEvent, configuredProviders } from '@/lib/forward';
import { readJSON } from '@/lib/bounded-body';
export const runtime = 'nodejs';
const Payload = z.object({ event: z.string().max(80), properties: z.record(z.string(), z.unknown()).default({}) }).strict();
let count = 0; let windowStart = Date.now();
export async function POST(request: Request) {
  // This is an operator-only template gateway. Anonymous public visitors cannot spend provider quota.
  const configured = process.env.TRACKFAST_OPERATOR_TOKEN;
  if (!configured) return NextResponse.json({ error: 'Template forwarding is disabled. Configure server TRACKFAST_OPERATOR_TOKEN and vendor keys.' }, { status: 503 });
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(configured) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(configured))) return NextResponse.json({ error: 'Operator authorization required.' }, { status: 401 });
  if (Date.now() - windowStart > 60000) { count = 0; windowStart = Date.now(); }
  if (++count > 60) return NextResponse.json({ error: 'Template event limit reached. Retry in one minute.' }, { status: 429 });
  let payload; let properties;
  try { payload = Payload.parse(await readJSON(request, 16000)); properties = validateEvent(payload.event, payload.properties); }
  catch { return NextResponse.json({ error: 'Invalid event or properties. Check insight.yml and regenerate helpers.' }, { status: 400 }); }
  const results = await forwardEvent(payload.event, properties, process.env);
  if (!results.length) return NextResponse.json({ success: false, error: 'No provider is configured.' }, { status: 503 });
  const success = results.some(result => result.accepted);
  return NextResponse.json({ success, validated: true, event: payload.event, providers: results, receipt: 'unknown' }, { status: success ? 200 : 502 });
}
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'trackfast-api', version: '0.1.0', providers: configuredProviders(process.env), forwardingEnabled: !!process.env.TRACKFAST_OPERATOR_TOKEN, note: 'Configuration presence only. Provider health and downstream receipt are unknown.' }, { headers: { 'Cache-Control': 'no-store' } });
}
