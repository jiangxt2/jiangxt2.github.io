# 影神图

一个基于 Hugo 的个人技术站点，包含 Markdown 博客、原生 HTML/JavaScript Demo，以及 Vue 3 + Vite Demo。

## Local development

Prerequisites:

- Hugo Extended
- Node.js 22 or newer
- npm

Install the Vue Demo dependencies once:

```bash
npm install --prefix demos/vue-counter
```

Run the Hugo development server:

```bash
hugo server --buildDrafts
```

Build the complete site locally:

```bash
npm run build
```

The generated site is written to `public/`. The Vue Demo is available at `/demos/vue-counter/` after the complete build.

Preview the complete generated site locally:

```bash
npm run preview
```

Then open `http://localhost:1313/`. Stop the preview server with `Ctrl-C`.

## Deployment

The repository is intended for the `jiangxt2.github.io` GitHub Pages user site. The workflow in `.github/workflows/deploy.yml` builds Hugo first, builds the Vue Demo into the published `public/demos/vue-counter/` directory, and deploys the combined output with GitHub Pages.

In the GitHub repository settings, select GitHub Actions as the Pages source. Pushes to `master` publish automatically, while pull requests can use the workflow run and local preview to validate changes before merging.

For a complete local preview, build the site first and serve the generated `public/` directory with any local static HTTP server. The Hugo development server is useful for article editing, while the Vue Demo can be run independently with `npm run dev --prefix demos/vue-counter`.

The current site uses the free `https://jiangxt2.github.io/` address. A custom domain can be added later by changing `baseURL` in `hugo.toml` and configuring the domain in GitHub Pages.
