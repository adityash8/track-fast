# Trackfa.st

Analytics doctor for authorized sites. Observe GA4, PostHog and Mixpanel requests, distinguish accepted provider responses from unknown downstream receipt, and export a bounded JSON report. The web app inspects HTML/scripts or imports a real CLI/HAR capture; it never manufactures provider health.

```sh
npm install
npm run dev
npm run doctor -- https://your-site.example --expect posthog --json
```

Download an installable CLI tarball from the app, or run `npm run pack:cli`. No npm publication is required. The CLI is observation-only by default. Own-template test events require deliberate opt-in and a server-only operator token.

The existing `insight.yml` → typed helpers and Zod gateway remain available. `npm run gen:schema` regenerates them. All-provider forwarding failure is an error, not a successful event.

[Setup, privacy and environment configuration](docs/SETUP.md) · [Story coverage and verification](docs/IMPLEMENTATION.md) · [Full Linear PRD](docs/LINEAR_PRD.md)

```sh
npm run typecheck
npm run lint
npm test
npm run build
# Start production server before browser verification:
npm start
npm run test:browser
```

Set `PUPPETEER_EXECUTABLE_PATH` to an installed Chrome executable if Puppeteer's bundled browser is unavailable. Supabase, Slack, GitHub Env-Wizard and billing are not prerequisites for the current standalone doctor.
