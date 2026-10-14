# Trackfast setup

## Doctor CLI

Download the tarball from the app. Node 20 or newer is required.

```sh
npm install -g ./trackfast-doctor-0.1.0.tgz
trackfast doctor https://your-site.example --expect posthog --json --output report.json
```

Puppeteer installs Chrome during dependency installation. If missing, run `npx puppeteer browsers install chrome`. Only inspect sites you are authorized to test. The doctor navigates a browser and observes normal traffic; it never clicks consent or injects events by default. The site's own scripts may emit pageviews. Consent gates, custom collection proxies, delayed tags and ad blockers can leave evidence unknown. Run with `--wait 10000` for delayed events. Custom proxy requests cannot be attributed to a vendor without independent evidence.

Exit codes: 0 means an accepted provider response was observed for all detected vendors (or the expected vendor); 1 means rejection or a missing explicitly expected vendor in a browser capture; 2 means evidence is unknown; 3 means invalid arguments, report or browser failure. GA4 2xx is HTTP acceptance only, not payload validation or downstream ingestion. PostHog/Mixpanel require positive response bodies. All downstream receipt stays unknown.

Use `--import report.json` to evaluate a saved CLI JSON or a DevTools HAR capture. Importing in the web app is local to your browser; the app discards headers, bodies, queries, user identifiers and non-vendor requests. Treat original HAR files as sensitive. Reports are operator-supplied evidence, not a server certification. Outputs exclude query strings and redact non-root paths. Existing output files are never overwritten.

## Static web inspection

The app fetches public HTML and up to four referenced scripts, without executing them. Each fetch is limited to 750 KB, redirects to four hops, and the inspection to 20 seconds. Only public HTTP(S) addresses on ports 80/443 are allowed, including every DNS answer and redirect. DNS is pinned to the validated IP for the actual connection. Import a browser report for request/response evidence. SDK detection alone always remains unknown.

Reports are held in this browser tab, with explicit export/import for persistence. No accounts, shared workspace, cloud report storage, billing or manufactured health score are present. Anonymous inspection has instance-local limits of two concurrent scans and ten scans/minute. For public Vercel release the parent must configure a global firewall/rate limit; instance-local limits do not constrain a distributed deployment.

## Typed template and own test events

```sh
npm install
npm run gen:schema
npm run dev
# Or, inside this template after installing the CLI:
trackfast gen
```

Edit `insight.yml` then regenerate. Existing `analytics.signUp`, `signIn`, `pageView`, `featureUsed`, `subscriptionCreated`, `paymentCompleted` stay typed. Unknown properties/events are rejected. Amounts are positive safe integer cents and currencies are three uppercase letters. Generated output is deterministic. Client tracking initializes only when explicitly called, disables automatic pageviews/autocapture and uses memory persistence. `client-queued` means queued, not confirmed accepted. Email-bearing events must use the server gateway, which hashes normalized email before forwarding.

Configure secrets only in `.env.local` or the Vercel server environment. Do not prefix secrets with NEXT_PUBLIC. Health shows configuration presence, not provider connectivity.

| Variable | Purpose |
| --- | --- |
| TRACKFAST_OPERATOR_TOKEN | Random server-only operator token; gateway disabled without it |
| TRACKFAST_TEMPLATE_ORIGIN | Own template origin for server helpers |
| POSTHOG_KEY | PostHog project ingest key |
| POSTHOG_REGION | `us` (default) or `eu` |
| NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_HOST | Optional direct browser capture project key/host; never use a personal/admin key |
| NEXT_PUBLIC_GA4_ID | GA4 measurement ID |
| GA4_API_SECRET | Server-only Measurement Protocol secret |
| MIXPANEL_TOKEN | Server-only project ingest token |
| MIXPANEL_REGION | `us` (default) or `eu` |

The gateway accepts only bearer operator authorization and limits a process to 60 events/minute. It does not treat a caller user ID as verified identity. Each request gets an anonymous ID; this version does not claim person-level retention. No anonymous public event forwarding, shared analytics workspace or paid entitlement is implemented. Never expose the operator token in client code. Use it only from a trusted server or your local CLI environment.

Explicitly opt in to one event on your own template:

```sh
# Set TRACKFAST_OPERATOR_TOKEN and TRACKFAST_TEMPLATE_ORIGIN privately in your shell first.
trackfast doctor https://your-own-template.example --test-events --expect posthog
```

The CLI requires the target origin to match `TRACKFAST_TEMPLATE_ORIGIN`, verifies the template health marker, then submits one `feature_used` event from Node without exposing the token to page scripts. A proxy response is reported separately; it is not fabricated vendor evidence. Without configured providers, forwarding returns 503; all rejected/unreachable providers return 502; partial acceptance returns 200 with per-provider results and unknown downstream receipt. Validation returns 400. Authorization returns 401.

## Deployment and future scope

Vercel imports this Next.js repo using `npm run build`; no custom deployment config is needed. Parent owns credentials, dependency installation, security-patched framework checks, cloud release and review. The downloadable package is built into public/downloads during the production build; npm publication is unnecessary.

GitHub Env-Wizard, automatic PostHog dashboards, scheduled Slack/Claude digests, replay storage, JWT/TOTP accounts and viewer workspaces remain future platform phases. No fake adapters or successful messages are shown. Supabase and payment credentials are not required for this standalone tool.
