# Contributing

## Working copy

- Keep the canonical clone on `master` and leave it clean.
- Make every code or content change in a dedicated Git worktree.
- Name a worktree with the project and branch, for example `jiangxt2.github.io-personal-site-refinement`.
- Keep the development branch separate from `master`; push it explicitly when a remote branch is needed.
- Production deployment is performed only from `master`.

## Local preview

Install dependencies once with `npm ci --prefix demos/vue-counter`, then use `npm run preview` for a complete Hugo plus Vue preview at `http://localhost:1313/`.

Use `hugo server --buildDrafts` when iterating only on Markdown content. Use `npm run dev --prefix demos/vue-counter` when iterating only on the Vue Demo.

## Publishing

Pull requests run the build workflow without deploying. A push to `master` builds Hugo and the Vue Demo, uploads the combined `public/` directory, and deploys it to GitHub Pages.
