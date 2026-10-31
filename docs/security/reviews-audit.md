# Review submission security review — 1 November 2026

Scope: the static Next.js review UI, public Supabase REST API, review table/RPC, export configuration, dependencies, and deployment workflow. This is a scoped code review and regression test exercise, not a penetration-test certification or guarantee against the OWASP Top 10.

## Findings and fixes

The original implementation already used JSON/PostgREST rather than concatenated SQL, validated table lengths and rating range, denied public updates/deletes, and rendered text through React escaping. Arbitrary text stored in a database is not itself SQL injection or XSS. Do not add a keyword blacklist or strip apostrophes; keep data separate from executable code and encode at its output context.

The material gap was unlimited anonymous direct inserts. The new migration removes public table writes and exposes only `submit_review(payload)`:

- Strict JSON object, exact allowed fields, string/integer types, maximum lengths, nonblank values, and control-character checks on the server. Extra fields (IDs, timestamps, approval flags) are rejected. Metadata is database-generated.
- Fixed SQL and an empty search path. The security-definer function intentionally has insertion privileges; caller input can never select SQL identifiers, roles, or statements. Only `anon` and `authenticated` receive explicit execution rights; private state has no API grants and RLS is enabled.
- Serialized global budgets: at most 5 accepted submissions per minute window and 100 per 24-hour window. Counters persist independently of review deletion. A transaction-level try-lock rejects contention rather than queuing writers. Duplicate name/text/rating submissions within 24 hours are rejected.
- Immediate publication, as requested. No CAPTCHA, identity verification, or moderation is implied.
- Bounded client timeouts, generic error messages, specific safe duplicate/rate-limit messages, and preserved form content after failure. No raw database error is rendered.
- Production static exports receive a meta CSP with hashes for generated inline hydration scripts. Arbitrary inline scripts, event handlers, objects, frames, base tags, and form navigation are disallowed; API connections are restricted to the configured HTTPS origin. Inline styles remain allowed for the existing UI. CSP hashes must be regenerated on every build.
- Build configuration rejects secret/service-role keys and non-HTTPS API origins. This protects future builds, not credentials previously committed or deployed. `.env.local` remains ignored.
- Removed the unused `shadcn` generator package (not `@shadcn/react` or generated components), eliminating all seven reported dependency advisories. `npm audit` reported zero known advisories afterward. Tests and a moderate-or-higher dependency audit gate now run before deployment.

## OWASP Top 10:2025 mapping

| Category | Controls / review result | Remaining responsibility or limit |
| --- | --- | --- |
| A01 Broken Access Control | RLS, revoked table writes, explicit column read grants, fixed-purpose RPC, inaccessible budget state; both public API roles tested | Reviews are intentionally public. Database administrators and service-role credentials remain privileged. |
| A02 Security Misconfiguration | Restricted grants, pinned function search path, production CSP, HTTPS configuration validation | GitHub Pages cannot set application-specific HTTP headers. Meta CSP cannot enforce `frame-ancestors`; clickjacking protection needs a host/proxy supporting response headers. Review Supabase project settings separately. |
| A03 Software Supply Chain Failures | Removed vulnerable unused generator; lockfile and `npm ci`; deployment test/audit gates | Registry/audit coverage is incomplete; repository protection, action provenance, ongoing updates and access review are operational controls. |
| A04 Cryptographic Failures | HTTPS-only API, no privileged browser keys | Provider-managed encryption, account MFA, secret rotation, and backup access must be managed in Supabase/GitHub. No sensitive information should be entered in public reviews. |
| A05 Injection | JSON parameters, no dynamic SQL, server validation, React text escaping, hash CSP; SQL/HTML attack strings tested as literal data | Never reuse review content as HTML, shell commands, SQL, or spreadsheet formulas without context-appropriate handling. Stored text is not “sanitized for every context.” |
| A06 Insecure Design | Server-controlled metadata, persistent global budgets, duplicate checks, immediate-publication tradeoff explicit | Global limits can be exhausted by one attacker and prevent legitimate submissions. No bot/identity verification or per-client fairness. |
| A07 Authentication Failures | No review login or identity claims; authenticated role cannot bypass limits or write directly | Names are self-reported, not verified purchasers. Supabase/GitHub administrator MFA and account security remain necessary. |
| A08 Software or Data Integrity Failures | Database-generated IDs/times, exact payload allowlist, transactional insert/counter update, migration tracking, dependency lockfile | Administrator changes and compromised CI/provider accounts remain outside this form's controls. |
| A09 Security Logging and Alerting Failures | Safe HTTP failure statuses and existing Supabase API logs; inspect private counters with admin access | No automated security alert delivery configured. Monitor spikes in 4xx/429, errors, storage and database load; choose retention and an alert destination. No review bodies are deliberately logged by app code. |
| A10 Mishandling of Exceptional Conditions | Transaction rollback, fail-fast lock contention, safe errors, timeout, no optimistic save, build rejects unsafe config | Network timeouts can leave save outcome uncertain; UI asks users to refresh. Duplicate checks reduce retries but are not per-request idempotency. |

SSRF (a separate 2021 category) also has no review-input fetch path: only the configured API origin is used, and no URL in review text is followed by this code.

## Verification

- `npm test`: client validation/request handling, metadata allowlist, safe text rendering, build credential guards, CSP generation.
- `npm run build`: TypeScript and production export, including CSP post-processing.
- `node --env-file=.env.local tests/reviews-api.mjs`: non-destructive live public API checks. Reads succeed; direct writes fail; invalid/mass-assignment RPC inputs fail.
- `npx --yes supabase db query --linked --file supabase/tests/review_security.sql`: transactional database tests under `anon` and `authenticated`. Exercises valid saves, injections as data, malformed input, denied writes/private reads, duplicates and budgets. All test records/counter updates roll back. Run off-peak: the test briefly locks the budget row and may cause concurrent submissions to receive 429.
- The migration and database tests were first executed together in a rollback-only preflight before deployment.
- Targeted lint passes with the repository's pre-existing unsupported `react/react-compiler` rule omitted. The standard lint configuration still needs a separate compatibility fix.
- Browser automation was unavailable in this session. Production CSP generation is tested, but a real-browser production smoke test remains outstanding: open the local export at port 3001, confirm reviews load, choose a rating, and inspect DevTools for CSP violations. The CSP is applied to exports, not `next dev`.

## Supabase security advisor

The live security advisor returned two warnings: anonymous and authenticated users can execute `public.submit_review` as a security-definer function. This is intentional for the current design: callers cannot insert into the table and the validated RPC performs that one operation on their behalf. The function uses fixed SQL, an empty search path, server-generated metadata, strict validation and shared limits. These warnings are documented, not suppressed. Do not add arbitrary SQL, configurable table names, administrative operations, or generic update logic to this function. An Edge Function with public RPC execution revoked is the next boundary improvement when bot protection is added.

No other findings were returned by this scoped advisor run; that is not evidence that provider/account configuration is comprehensively secure.

## Residual risks and next steps

These controls do not prevent request floods, distributed denial of service, objectionable reviews, or bot traffic. Rate limiting here caps *accepted records*, not HTTP requests or database CPU use. Attackers can exhaust the shared allowance; fixed windows also allow bursts near boundaries. Read endpoints remain public and can be scraped. Payload checks execute after the provider parses the request; they are not a gateway request-body limit.

For stronger abuse protection, place submissions behind an Edge Function/API gateway with a body-size limit, trusted client-IP rate limiting, and server-verified Turnstile, then revoke direct public RPC execution. Never rely on a browser CAPTCHA alone, `Origin`/CORS, a caller-supplied IP header, or a client-generated device ID as authorization. No CAPTCHA was configured, per the user's instruction to proceed with database protections first.

The database migration is applied remotely. Frontend, CSP and workflow changes need to be deployed together; an older frontend still using direct INSERT will now fail closed. Local development uses the updated RPC.

References: [OWASP Top 10:2025](https://top10.owasp.org/2025/0x00_2025-Introduction/), [Supabase function security](https://supabase.com/docs/guides/database/functions), [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api). Next.js static-export and CSP guidance was checked against the installed package's documentation.
