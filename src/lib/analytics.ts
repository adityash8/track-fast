import posthog from 'posthog-js';

// SDK initialization is explicit: importing helpers never emits events.
let initialized = false;
export const track = async (event: string, properties?: Record<string, unknown>) => {
  const { validateEvent } = await import('./event-schemas');
  let clean;
  try { clean = validateEvent(event, properties || {}); }
  catch { return { success: false, error: 'Invalid event properties. Check insight.yml.' }; }
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    if (!initialized) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        person_profiles: 'identified_only', autocapture: false, capture_pageview: false, capture_pageleave: false,
        persistence: 'memory',
      });
      initialized = true;
    }
    if ('email' in clean) return { success: false, error: 'Send events containing email through your server gateway, which hashes email.' };
    posthog.capture(event, clean);
    return { success: true, method: 'client-queued' }; // Queueing is not proof of provider acceptance.
  }
  if (typeof window !== 'undefined') return { success: false, error: 'Client analytics is not configured. Use the authorized server gateway.' };
  const origin = process.env.TRACKFAST_TEMPLATE_ORIGIN;
  const token = process.env.TRACKFAST_OPERATOR_TOKEN;
  if (!origin || !token) return { success: false, error: 'Configure server TRACKFAST_TEMPLATE_ORIGIN and TRACKFAST_OPERATOR_TOKEN.' };
  try {
    const response = await fetch(new URL('/api/track', origin), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event, properties: clean }), signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    return response.ok ? { success: true, method: 'server-accepted' } : { success: false, error: `Gateway returned HTTP ${response.status}.` };
  } catch { return { success: false, error: 'Gateway request failed.' }; }
};

// Convenient pageview helper
export const pageview = (path?: string) => {
  const url = path || (typeof window !== 'undefined' ? window.location.pathname : '/');
  return track('pageview', { path: url, referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined });
};

// Identification is a client SDK operation, never a claim of authenticated ownership.
export const identify = (userId: string, traits?: Record<string, unknown>) => {
  if (typeof window === 'undefined' || !initialized) return { success: false, error: 'Initialize client capture explicitly before identification.' };
  posthog.identify(userId, traits);
  return { success: true, method: 'identity-queued' };
};
export const reset = () => {
  if (typeof window === 'undefined' || !initialized) return { success: false, error: 'Client capture is not initialized.' };
  posthog.reset();
  return { success: true, method: 'client-reset' };
};

// Type-safe event helpers using generated schemas
export const analytics = {
  // Authentication events
  signUp: async (email: string, plan: 'free' | 'starter' | 'growth', source?: string) => {
    const { trackEvent } = await import('./event-schemas');
    return trackEvent('user_signed_up', { email, plan, source });
  },

  signIn: async (email: string, method: 'password' | 'google' | 'github') => {
    const { trackEvent } = await import('./event-schemas');
    return trackEvent('user_signed_in', { email, method });
  },

  // Product events
  pageView: async (path: string, referrer?: string) => {
    const { trackEvent } = await import('./event-schemas');
    return trackEvent('pageview', { path, referrer });
  },

  featureUsed: async (feature: string, location?: string) => {
    const { trackEvent } = await import('./event-schemas');
    return trackEvent('feature_used', { feature, location });
  },

  // Business events
  subscriptionCreated: async (plan: 'starter' | 'growth' | 'agency', amount: number, currency = 'USD') => {
    const { trackEvent } = await import('./event-schemas');
    return trackEvent('subscription_created', { plan, amount, currency });
  },

  paymentCompleted: async (amount: number, currency = 'USD', plan?: string) => {
    const { trackEvent } = await import('./event-schemas');
    return trackEvent('payment_completed', { amount, currency, plan });
  },

  // Legacy functions for backward compatibility
  track,
  pageview,
  identify,
  reset,
};

export default analytics;
