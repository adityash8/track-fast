import { randomUUID, createHash } from 'node:crypto';
import { acceptedResponse } from '../../cli/report.mjs';
export type ProviderEnv = Record<string, string | undefined>;
export function configuredProviders(env: ProviderEnv) {
  return { posthog: !!(env.POSTHOG_KEY || env.NEXT_PUBLIC_POSTHOG_KEY), ga4: !!(env.NEXT_PUBLIC_GA4_ID && env.GA4_API_SECRET), mixpanel: !!env.MIXPANEL_TOKEN };
}
export async function forwardEvent(event: string, properties: Record<string, unknown>, env: ProviderEnv, send: typeof fetch = fetch) {
  const anonymousId = randomUUID();
  const clean = { ...properties };
  if (typeof clean.email === 'string') clean.email = createHash('sha256').update(clean.email.trim().toLowerCase()).digest('hex');
  delete clean.userId; delete clean.distinct_id; delete clean.client_id;
  const providers = configuredProviders(env);
  const jobs: { vendor: 'posthog' | 'ga4' | 'mixpanel'; url: string; body: unknown }[] = [];
  if (providers.posthog) jobs.push({ vendor: 'posthog', url: `https://${env.POSTHOG_REGION === 'eu' ? 'eu' : 'us'}.i.posthog.com/capture/`, body: { api_key: env.POSTHOG_KEY || env.NEXT_PUBLIC_POSTHOG_KEY, event, properties: { ...clean, distinct_id: anonymousId } } });
  if (providers.ga4) jobs.push({ vendor: 'ga4', url: `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(env.NEXT_PUBLIC_GA4_ID!)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET!)}`, body: { client_id: anonymousId, events: [{ name: event, params: clean }] } });
  if (providers.mixpanel) jobs.push({ vendor: 'mixpanel', url: `https://${env.MIXPANEL_REGION === 'eu' ? 'api-eu' : 'api'}.mixpanel.com/track?verbose=1`, body: [{ event, properties: { ...clean, token: env.MIXPANEL_TOKEN, distinct_id: anonymousId, $insert_id: randomUUID() } }] });
  return Promise.all(jobs.map(async job => { try { const response = await send(job.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job.body), signal: AbortSignal.timeout(5000), redirect: 'error' });
    const body = (await response.text()).slice(0, 100000);
    return { vendor: job.vendor, status: response.status, accepted: acceptedResponse(job.vendor, response.status, body), receipt: 'unknown' as const };
  } catch { return { vendor: job.vendor, status: 0, accepted: false, receipt: 'unknown' as const }; } }));
}
