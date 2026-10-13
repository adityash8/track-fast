import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inspectWebsite } from '@/lib/inspect';
import { readJSON } from '@/lib/bounded-body';
export const runtime = 'nodejs';
let active = 0; let starts: number[] = [];
const Input = z.object({ url: z.string().url().max(2048), expected: z.enum(['any', 'ga4', 'posthog', 'mixpanel']).default('any') }).strict();
export async function POST(request: Request) {
  // Anonymous free tool: no paid providers. Limits are instance-local; deployment must add a global firewall limit.
  starts = starts.filter(time => time > Date.now() - 60000);
  if (active >= 2 || starts.length >= 10) return NextResponse.json({ error: 'Inspection is busy. Retry in one minute or use the local CLI.' }, { status: 429, headers: { 'Retry-After': '60' } });
  let input;
  try { input = Input.parse(await readJSON(request, 4096)); }
  catch { return NextResponse.json({ error: 'Enter a public HTTP(S) URL and a supported expected vendor.' }, { status: 400 }); }
  starts.push(Date.now()); active++;
  try { return NextResponse.json(await inspectWebsite(input.url, input.expected), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Inspection failed. Import a CLI report instead.' }, { status: 422 }); }
  finally { active--; }
}
