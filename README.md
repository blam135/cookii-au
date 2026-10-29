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

No environment variables are required. The repository name is detected automatically so asset URLs include the `/cookii-au` base path on GitHub Pages while local development remains at `/`.

## Production build

```bash
npm run build
```

Use `nvm use` to select the patched Node.js version in `.nvmrc`. Supported Node.js versions are 22.23.4+, 24.22.1+, and 26.12.1+ within those major releases; npm enforces these minimums. The project self-hosts its fonts, so production builds do not depend on Google Fonts being reachable.
