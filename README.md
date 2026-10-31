# Cookii by Talya

Marketing site for Cookii by Talya, built with Next.js and deployed as a static site on GitHub Pages.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to GitHub Pages

Push to `main`, or run the **Deploy to GitHub Pages** workflow manually from the Actions tab. The workflow enables GitHub Pages for the repository when needed.

The workflow builds the Next.js static export, uploads the generated `out/` directory, and publishes it at:

<https://blam135.github.io/cookii-au/>

Supabase environment variables are required for reviews (see below). The repository name is detected automatically so asset URLs include the `/cookii-au` base path on GitHub Pages while local development remains at `/`.

## Production build

```bash
npm run build
```

Use `nvm use` to select the patched Node.js version in `.nvmrc`. Supported Node.js versions are 22.23.4+, 24.22.1+, and 26.12.1+ within those major releases; npm enforces these minimums. The project self-hosts its fonts, so production builds do not depend on Google Fonts being reachable.

## Persistent reviews (Supabase)

1. Create a Supabase project, then apply the SQL files in `supabase/migrations/` in filename order using the CLI below (or SQL Editor). This creates the reviews table, validation constraints, and row-level security policies.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` to your project URL and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to its publishable key (a legacy **anon** key also works). Find these in the project's Connect dialog / API settings. Never use a secret or service-role key in these variables.
3. Restart `npm run dev`. Submit a review, then open another browser to confirm it is shared.
4. For GitHub Pages, add the same two values under **Repository Settings → Secrets and variables → Actions → Variables**, then rebuild/deploy. Next.js embeds these public settings at build time.

Visitors can read reviews (the UI shows the latest 20) and submit through the validated `submit_review` RPC. Direct table writes are denied. IDs and timestamps are database-generated. Reviews publish immediately without sign-in or moderation. A shared database safety limit allows 5 accepted submissions per minute and 100 per 24 hours; identical submissions within 24 hours are blocked. This is not CAPTCHA or protection against request floods. You can manage records in Supabase's Table Editor. See [the security review](docs/security/reviews-audit.md) for controls, tests, and remaining risks.

Without configuration, submissions are disabled. Failed submissions preserve the form. Old local-storage demo reviews and sample testimonials are not uploaded or displayed as real customer reviews.

The client uses Supabase's [REST API](https://supabase.com/docs/guides/api/creating-routes) with a [publishable key and row-level security](https://supabase.com/docs/guides/getting-started/api-keys), so the site remains a static GitHub Pages export.

Run regression tests with `npm test`. Production builds also apply a hash-based Content Security Policy to the static export.

### Applying migrations with the CLI

The workspace is initialized for Supabase CLI. On a new machine, authenticate and link once:

```bash
npx --yes supabase login
npx --yes supabase link --project-ref svkzygxdygxmvtlkayrc
```

Preview and apply pending migrations:

```bash
npx --yes supabase db push --linked --dry-run
npx --yes supabase db push --linked
```

The CLI records applied migrations, so subsequent pushes only apply new files. Local project links and login credentials are not committed.
