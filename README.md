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
same-origin `/api` URL. After checks pass on `main`, the workflow deploys this artifact to EC2.

## Automatic EC2 deployment

Pushes to `main` deploy after CI succeeds. Pull requests only run checks.
Manual runs on `main` also deploy. Runs on `main` are serialized so a newer
push does not interrupt an active deployment.

Checks run on GitHub-hosted Ubuntu runners. Only the deploy job runs on the
repository's EC2 runner (`rtr-ec2-frontend`, label `rtr-production`), as user
`ubuntu`. The runner is installed as a systemd service under
`/home/ubuntu/actions-runner-frontend`. It connects outbound to GitHub over
HTTPS; deployment does not require inbound SSH from GitHub or SSH secrets.
Production application secrets stay on EC2. Do not move pull request jobs onto
the production runner.

If deployment stays queued, check the runner under repository Settings →
Actions → Runners and inspect the `actions.runner.*` systemd service on EC2.

`deployment/deploy.sh` publishes the checked build to `/var/www/rtr`, replaces
`index.html` atomically, keeps old hashed assets for existing tabs, and verifies
the HTTPS response through local Nginx. A failed verification restores the
previous index. The revision is recorded in `~/.cache/rtr-frontend-revision`.
Old assets are retained and may be cleaned up during planned maintenance.

## Chat language detection

Free-text chat detects the language of the latest guest message during the
existing intent request. Supported codes match the UI selector: `en`, `vi`,
`ko`, `ja`, `cn`, `ru`, `kz`, `es`, `fr`, `it`. The detected language is used
for the current answer and returned as `language` in the chat response. The
widget updates the shared language context, including the selector and page
copy. A manual selection made during an in-flight request takes precedence.
Unsupported or ambiguous input retains the current language. No extra AI
request is added, and changing language does not reset the conversation.
