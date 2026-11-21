# Cookii by Talya

Marketing site for Cookii by Talya, built with Next.js and deployed as a static site on GitHub Pages.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to GitHub Pages

Push to `main`, or run the **Deploy frontend to GitHub Pages** workflow manually from the Actions tab. The workflow enables GitHub Pages for the repository when needed.

After a successful backend deployment for a push to `main`, the frontend workflow tests and builds that same commit, then publishes the generated `out/` directory at:

<https://blam135.github.io/cookii-au/>

Configure the [backend deployment credentials and variables](backend/README.md#github-deployment), including `NEXT_PUBLIC_REVIEWS_API_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, before merging to `main`.

## Production build

```bash
npm run build
```

Use `nvm use` to select the patched Node.js version in `.nvmrc`. Supported Node.js versions are 22.23.4+, 24.22.1+, and 26.12.1+ within those major releases; npm enforces these minimums. The project self-hosts its fonts, so production builds do not depend on Google Fonts being reachable.

## Customer reviews

The static website calls a Cloudflare Worker → Durable Object → Notion data source. The browser receives only the API URL and public Turnstile site key; the Notion integration token stays in Worker secrets. Reviews publish immediately, without sign-in or moderation. The UI displays the latest 20 reviews.

See [backend setup and deployment](backend/README.md) for the backend architecture, configuration, and local development instructions. Copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_REVIEWS_API_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and restart development. For production, set the same GitHub Actions repository variables and rebuild the website.

Set `NEXT_PUBLIC_REVIEWS_API_URL` to the backend base URL (for example, `https://cookii-reviews.<subdomain>.workers.dev`); the application appends `/reviews`. A trailing slash is accepted.

Without configuration, submissions remain disabled. Failed submissions preserve the form. Run `npm test` for client and backend regression tests, and `npm run build` for the static export with hash-based CSP.

## Testing

`npm test` runs the Playwright Test regression project (no browser download required). `npm run test:ui` opens its interactive runner. Run backend checks separately with `npm run typecheck --prefix backend` and `npm test --prefix backend`.

`playwright.config.ts` also defines a Chromium project for future `tests/**/*.e2e.ts` browser tests. Start the app, set `PLAYWRIGHT_BASE_URL` if needed, install Chromium with `npx playwright install chromium`, and run `npx playwright test --project=chromium`. No additional browser tests are introduced yet. CI uses the regression project and produces an HTML report on failure.
