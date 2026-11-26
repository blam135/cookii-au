# Cookii by Talya

Marketing site for Cookii by Talya, built with Next.js and deployed as a static site on GitHub Pages.

## Local development

```bash
npm install --global pnpm@10.34.5
pnpm install
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The root frontend and `backend/` form a pnpm workspace with one `pnpm-lock.yaml`. Run `pnpm install` at the root to install both projects. Use `pnpm dev:backend` in another terminal for the Worker, or `pnpm --filter cookii-reviews-worker <script>` for backend commands. Run `pnpm test:all` for both regression suites. CI installs the pinned pnpm version with a frozen lockfile.

## Deploy to GitHub Pages

Push to `main`, or run the **Deploy frontend to GitHub Pages** workflow manually from the Actions tab. The workflow enables GitHub Pages for the repository when needed.

After a successful backend deployment for a push to `main`, the frontend workflow tests and builds that same commit, then publishes the generated `out/` directory at:

<https://blam135.github.io/cookii-au/>

Configure the [backend deployment credentials and variables](backend/README.md#github-deployment), including `NEXT_PUBLIC_REVIEWS_API_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, before merging to `main`.

## Production build

```bash
pnpm run build
```

Use `nvm use` to select the patched Node.js version in `.nvmrc`. Supported Node.js versions are 22.23.4+, 24.22.1+, and 26.12.1+ within those major releases; pnpm enforces these minimums. The project self-hosts its fonts, so production builds do not depend on Google Fonts being reachable.

## Customer reviews

The static website calls a Cloudflare Worker → Durable Object → Notion data source. The browser receives only the API URL and public Turnstile site key; the Notion integration token stays in Worker secrets. Reviews publish immediately, without sign-in or moderation. The UI displays the latest 20 reviews.

See [backend setup and deployment](backend/README.md) for the backend architecture, configuration, and local development instructions. Copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_REVIEWS_API_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and restart development. For production, set the same GitHub Actions repository variables and rebuild the website.

Reviews are hidden by default. Set `NEXT_PUBLIC_REVIEWS_ENABLED=true` in `.env.local` to show them locally; only the exact value `true` enables the feature. When disabled, the section does not render and makes no review API or Turnstile requests.

For production, set the **repository variable** `NEXT_PUBLIC_REVIEWS_ENABLED` under **Settings → Secrets and variables → Actions → Variables**, then run **Deploy frontend to GitHub Pages** from `main` after this feature is merged. Set it to `true` to show reviews or `false` to hide them. The flag is compiled into the static site, so changing the variable requires a successful rebuild and deployment.

This flag controls visibility for every visitor. Backend access and writes remain controlled separately; `SUBMISSIONS_ENABLED=false` pauses API submissions when the backend is redeployed.

Set `NEXT_PUBLIC_REVIEWS_API_URL` to the backend base URL, `https://api.cookii-au.workers.dev`; the application appends `/reviews`. A trailing slash is accepted.

Without configuration, submissions remain disabled. Failed submissions preserve the form. Run `pnpm test:all` for client and backend regression tests, and `pnpm run build` for the static export with hash-based CSP.

## Testing

`pnpm test` runs the Playwright Test regression project (no browser download required). `pnpm run test:ui` opens its interactive runner. Run backend checks separately with `pnpm --filter cookii-reviews-worker typecheck` and `pnpm --filter cookii-reviews-worker test`.

`playwright.config.ts` also defines a Chromium project for `tests/**/*.e2e.ts` browser tests. The review tests intercept the API and Turnstile so they never create live reviews; they cover read/submit behavior, refresh, verification errors/expiry and mobile layout.

Build with the API URL and site key configured, then run the browser tests with the same `NEXT_PUBLIC_REVIEWS_ENABLED` value used for the build:

```sh
pnpm exec playwright install chromium
NEXT_PUBLIC_REVIEWS_ENABLED=true PLAYWRIGHT_START_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test --project=chromium
```

Enabled builds run the review/verification scenarios; disabled builds check that the section is absent and no review or Turnstile requests occur. To test the disabled state, rebuild with `NEXT_PUBLIC_REVIEWS_ENABLED=false` and pass `false` to the test command too. CI uses the same flag for its build and browser tests.

For an already-running app, omit `PLAYWRIGHT_START_SERVER` and set `PLAYWRIGHT_BASE_URL` to its address. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed browser. CI tests the static export with both projects before publishing, and produces an HTML report and failure traces.

## Unused code

Run `pnpm check:unused` to find unused files, exports, and dependencies across both workspace projects. Knip discovers Next.js routes and Playwright tests; standalone scripts are explicitly included. Shared review schemas resolve Zod from the backend workspace, so the frontend does not need a duplicate dependency declaration.
