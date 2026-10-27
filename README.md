# Menu Maestro Frontend

React + TypeScript + Vite. Requires Node.js 22.12+.

## Local

Run `npm ci`, then `npm run dev`. Frontend: http://localhost:8080.
Start the backend separately on port 3001. The default API base is `/api`,
proxied locally to http://127.0.0.1:3001. Optional environment settings:
`VITE_API_BASE_URL=/api`, `API_PROXY_TARGET=http://127.0.0.1:3001`.
Create your own `.env` if needed; environment files are excluded from Git.

## Vercel

Use the repository root, Vite preset, build `npm run build`, output `dist`.
Before deployment add a rewrite for `/api/:path*` to
`https://YOUR_BACKEND_DOMAIN/api/:path*` before the SPA fallback in `vercel.json`.
Keep `VITE_API_BASE_URL=/api` for same-origin authentication cookies.
Never put backend secrets in VITE variables.

## Checks

`npm run typecheck`, `npm run lint`, `npm run build`.

## GitHub Actions

The CI workflow runs on every push, on pull requests targeting `main`, and
manually from the repository's Actions tab. It uses Node.js 22 and installs
locked dependencies with `npm ci`. No production secrets are required.

Checks: ESLint, TypeScript and the Vite production build. The `frontend-dist`
artifact contains `dist/` and is kept for seven days. The build uses the default
same-origin `/api` URL. This workflow does not deploy the website.
