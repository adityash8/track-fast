# Trackfast implementation

## Correction plan — 2026-10-13

Treat any observed rejected collection response as a vendor failure, including a mixed accepted/rejected HAR. Prove it with `npm test` (real HAR import and CLI exit code), then run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:browser` where available, and `git diff --check`. Keep downstream receipt explicitly unknown.

## Plan before implementation

Scope follows the current Linear recommendation and the explicit portfolio assignment: standalone observation-only analytics doctor, a usable web inspector/report importer, installable CLI package, and repair of the existing schema-safe template. Preserve the incumbent blue/neutral visual system. Canonical clone is read-only; relocated typed template is the relevant baseline, not the older untyped root helpers.

1. Share an evidence model across a packaged Puppeteer CLI, bounded static web scanner, and local CLI/HAR import. Separate SDK detection, observed collection requests, accepted HTTP/provider responses, and unknown downstream receipt. Expected vendor controls failures; unknown exits 2, fail exits 1, pass exits 0.
2. Protect all web fetches using public-address validation, DNS pinning, redirect revalidation, timeouts, size/request/concurrency limits. No browser execution or paid APIs on the server. No accounts or caller-controlled entitlements.
3. Repair schema generation, runtime route validation and GET middleware, anonymous forwarding and provider error semantics; test event emission requires explicit opt-in and a configured own-template operator token.
4. Refine the existing app into an accessible desktop/mobile Operate tool with honest empty/loading/error/recovery states, actual downloads and setup instructions. Keep reports local; no shared workspace persistence.
5. Package and verify, then record coverage, prerequisites and API changes. Parent owns detached review, credentials, deployment, commit/PR/merge.

Exact checks: `npm run gen:schema`, `npm run typecheck`, `npm run lint`, `npm test` (domain/schema/SSRF/provider/report/CLI fixture tests), `npm run pack:cli` plus tarball installation/`trackfast --help`, `npm run build`, and `npm run test:browser` against the production app (import/export, first-run, error recovery, mobile, own health and denied events). No CI changes or production credits.

PRD resolution: US-TF-001/003/004/005 are the active template/doctor/schema stories. US-TF-002's GitHub credential injector is outside standalone scope; supply manual environment setup. US-TF-006/007 are Phase 3 future, US-TF-008 replay is future; US-TF-009/010 belong to a future authenticated workspace, not this local report tool. No simulated dashboards, messages, billing or trust score.

## Handoff and story coverage — 2026-10-13

| Story | Coverage |
| --- | --- |
| US-TF-001 | Existing template retained with explicit client initialization, server gateway and six typed helpers. GitHub template publication is a parent repository setting. |
| US-TF-002 | Manual Vercel environment setup documented in `docs/SETUP.md`; GitHub App key injection and badge are outside the standalone doctor scope and are not claimed. |
| US-TF-003 | Installable `trackfast-doctor-0.1.0.tgz`, observation-only browser CLI, JSON/HAR import, expected vendor, evidence stages and exit codes 0/1/2/3. CLI fixture with real local HTTP responses still needs an outside-sandbox Chrome run. |
| US-TF-004 | Bearer-protected own-template gateway validates generated schema, bounds requests, hashes email, strips caller identity fields and reports provider results. No Supabase rejection archive or replay claim. |
| US-TF-005 | `insight.yml` generates deterministic Zod validation and typed `trackEvent` helpers; invalid amount/currency and unknown fields are tested. The YAML DSL, snippets and CI schema lint are future scope. |
| US-TF-006/007 | Phase 3 dashboards and digest; no provider credits spent or Slack message sent. |
| US-TF-008 | Future replay storage; failed forwarding returns failure now. |
| US-TF-009/010 | Future authenticated workspace. This local report tool has no user accounts or viewer role. The gateway uses a server-only operator token, never caller-supplied ownership. |

## Verification

- `npm run gen:schema` — exit 0, six event schemas generated.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0.
- `node --import tsx --test tests/domain.test.ts tests/network.test.ts` — exit 0, 15/15 pass (schema, gateway authorization/failure, provider semantics, report privacy, SSRF and bounded fetch).
- `node --import tsx --test --test-name-pattern='operator token|CLI JSON' tests/cli.test.ts` — exit 0, 2/2 pass.
- `npm test` — exit 1, 17/18 pass; the local CLI browser fixture cannot find Puppeteer's Chrome in this sandbox. With `PUPPETEER_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, macOS refuses browser launch (`Failed to launch the browser process: Code: null`). Parent should rerun this command outside the sandbox.
- `npm run pack:cli` — exit 0; final tarball install with `npm install --prefix /private/tmp/trackfast-cli-final-install ./public/downloads/trackfast-doctor-0.1.0.tgz` and installed `trackfast --help` both exit 0. Installation used `npm_config_ignore_scripts=true` to avoid downloading Chrome during packaging verification; normal user installation permits Puppeteer's browser install.
- `npm run build` — exit 0, compiled and prerendered on installed Next 15.5.27. `node -p "require('./node_modules/next/package.json').version"` returns `15.5.27`; `eslint-config-next` is also 15.5.27 and both versions are locked exactly.
- Production HTTP smoke on port 42337: `GET /` → 200 (8725 bytes); `GET /api/track` → 200 with configuration presence and unknown provider health; unauthenticated `POST /api/track` → 503 while forwarding is disabled; `POST /api/inspect` for `http://127.0.0.1` → 422. No provider event was sent.
- `npm run test:browser` — exit 1 before navigation because macOS refuses Chrome launch in this sandbox. Parent should run it against `npm run start` outside the sandbox for desktop/mobile, import/export and error recovery.

## Release configuration and contracts

Browser Doctor correction (2026-10-13): response evidence now records HTTP 400+ as rejected when headers arrive. Body parsing can refine provider responses but cannot erase an observed HTTP rejection. A local Chrome fixture sends a Mixpanel 200 and a Mixpanel 403 whose body stays open past the three-second observation window; it checks both response records, vendor failure, unknown downstream receipt and imported CLI exit 1. `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check` exited 0. `PUPPETEER_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm test` passed 18/20 here; both browser fixture tests fail at Chrome launch (`Code: null`) in this sandbox, before assertions. Parent must rerun that command outside the sandbox.

Correction check (2026-10-13): an imported HAR with Mixpanel HTTP 200/body `1` and HTTP 403/body `0` now reports Mixpanel `fail`, `receipt: unknown`, and CLI exit 1. `node --import tsx --test --test-name-pattern='operator token|CLI JSON|mixed accepted' tests/cli.test.ts` passed 3/3; `node --import tsx --test tests/domain.test.ts tests/network.test.ts` passed 15/15. `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` exited 0. `PUPPETEER_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm test` passed 18/19; the only failure was Chrome launch blocked by this sandbox. `npm run test:browser` with that path also failed at Chrome launch before navigation. Parent's outside-sandbox browser evidence still applies to the prior flow, and should be rerun for this correction. Public CLI result semantics change: any observed provider rejection makes that vendor fail and sets exit 1 even when another response was accepted.

The standalone web inspector needs no credential. It needs a deployment-wide rate limit/firewall before public Vercel exposure because its in-process 10/minute and two-concurrent limits are per instance. CLI users need Node 20+ and an installable Chrome. To send an explicit own-template test event, an operator must set server-only `TRACKFAST_OPERATOR_TOKEN` and a `TRACKFAST_TEMPLATE_ORIGIN` matching the inspected origin, plus at least one provider key. Provider variables and setup commands are listed in `docs/SETUP.md`. Do not expose the operator token or GA4 secret in browser environment variables. Provider HTTP acceptance does not prove downstream ingestion; GA4 2xx does not prove payload validity. Reports stay in the tab unless exported.

Public contracts changed: new `POST /api/inspect` accepts `{url, expected?}` and returns a bounded static evidence report or 400/422/429; `GET /api/track` returns configuration-only health; `POST /api/track` now requires a bearer operator token, validates an event from `insight.yml`, and returns 400/401/429/502/503 or a 200 with per-provider acceptance and `receipt: "unknown"`. Previous anonymous forwarding callers must configure a trusted server token. CLI adds `trackfast doctor` and `trackfast gen`; the package is downloadable from `/downloads/trackfast-doctor-0.1.0.tgz`.

Changed files: `package.json`, `package-lock.json`, `README.md`, `eslint.config.mjs`, `scripts/gen-schema.ts`, `scripts/pack-cli.mjs`, `cli/*`, `docs/SETUP.md`, `docs/IMPLEMENTATION.md`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/api/inspect/route.ts`, `src/app/api/track/route.ts`, `src/lib/analytics.ts`, `src/lib/bounded-body.ts`, `src/lib/forward.ts`, `src/lib/inspect.ts`, `src/lib/safe-fetch.ts`, `src/middleware.ts`, `tests/*`, `public/downloads/trackfast-doctor-0.1.0.tgz`. The former root `middleware.ts` and `scripts/doctor.ts` were replaced by those paths. Generated `src/lib/event-schemas.ts` remains tracked and deterministic. No CI or cloud configuration was changed; no deployment, commit, PR or merge was performed.
