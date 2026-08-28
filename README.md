# JoJobuddy

[中文说明](./README.zh-cn.md)

Personal AI resume workbench: **Star Platinum** tailors your master resume to a job description; **Heaven's Door** scores ATS fit and drives auto-refine loops.

## Features

- **Workbench** — Pick a profile + job, craft a tailored resume, view scores and round-by-round iterations.
- **Profiles** — Upload or paste a master resume (Word / PDF / Markdown); export JSON or Markdown.
- **Jobs** — Paste a JD or parse a posting URL; filter by title, company, location, and date; clean entries older than 30 days.
- **Job URL parsing** — Site adapters for Apple, LinkedIn, and TikTok; Playwright fallback for heavy SPAs.
- **LLM settings** — Separate generator and judge models; admins can share **global** models (personal mock is not seeded when globals exist).
- **i18n** — English and 简体中文 in the UI.

## Stack

- Next.js 16 · React 19 · Tailwind CSS 4
- MongoDB
- Background worker (URL fetch, resume parse, craft jobs)
- Playwright (Chromium) for job pages when JSDOM is not enough

## Local development

**Requirements:** Node.js 24+, Docker (for MongoDB).

```bash
cp .env.example .env.local
# Set MONGODB_URI and AUTH_SECRET (see Environment variables)

docker compose up -d mongo
npm install
npm run playwright:install   # first time only, for URL parsing fallback
npm run dev:web              # terminal 1 — http://localhost:3000
npm run dev:worker           # terminal 2 — required for parse / craft
```

`npm run dev` runs web + worker together via `scripts/boot.mjs`.

### Tests

```bash
npm test
```

## Docker

One image; role is set with `JOJOBUDDY_ROLE` (`web` | `worker`).

```bash
cp .env.example .env
# Set AUTH_SECRET (and optional Google OAuth)

docker compose up -d --build
```

Pull a published image:

```bash
export JOJOBUDDY_IMAGE=ghcr.io/goagain/jojobuddy:latest
docker compose up -d
```

## NAS / production

Use [`docker-compose.nas.yml`](./docker-compose.nas.yml) with an external `reverse_proxy` network (e.g. Caddy). Pin a versioned image after release:

```bash
export JOJOBUDDY_IMAGE=ghcr.io/goagain/jojobuddy:v0.0.25
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d
```

The `release` branch has compose files pinned to each tagged release.

## Releases

Releases are cut manually via GitHub Actions workflow **Release** (`workflow_dispatch`):

1. Tests run on CI.
2. Docker image is pushed to `ghcr.io/goagain/jojobuddy:vX.Y.Z` (and semver tag without `v`).
3. Git tag + GitHub Release are created; the `release` branch is updated (see below).

Latest releases: [GitHub Releases](https://github.com/goagain/jojobuddy/releases)

### `release` branch

This repo uses two deployment tracks:

| Branch | Compose default image | Purpose |
|--------|----------------------|---------|
| `main` | `:latest` | Continuous delivery; always tracks the newest build on `main`. |
| `release` | `:vX.Y.Z` (pinned) | Stable deploys; updated only when you run the Release workflow. |

When a release succeeds, CI:

1. Checks out the released commit on branch `release`.
2. Rewrites the default `JOJOBUDDY_IMAGE` in `docker-compose.yml` and `docker-compose.nas.yml` to `ghcr.io/goagain/jojobuddy:vX.Y.Z`.
3. Commits that pin, tags **`vX.Y.Z`** on the pin commit, and force-pushes `release`.

So **`main` stays on `:latest`**; **`release` + git tag** give you reproducible compose defaults for NAS / Portainer.

**Deploy from the release branch** (no manual `JOJOBUDDY_IMAGE` export needed):

```bash
git fetch origin release
git checkout release
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d
```

Or clone/checkout `release` in Portainer and point the stack at `docker-compose.nas.yml` — defaults already pin to the last released version.

To run a specific older version, checkout tag `vX.Y.Z` instead of branch `release`, or set `JOJOBUDDY_IMAGE` explicitly.

**Cut a new release** (GitHub → Actions → Release → Run workflow, version e.g. `0.0.26`):

```bash
gh workflow run release.yml -f version=0.0.26
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `AUTH_SECRET` | Yes | Session signing secret (long random string) |
| `AUTH_URL` | Yes | Public app URL, e.g. `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth secret |
| `JOJOBUDDY_ROLE` | Docker | `web`, `worker`, or unset (web + one worker in same container) |
| `JOJOBUDDY_IMAGE` | Compose | Override image tag in compose files |

See [`.env.example`](./.env.example) for defaults.

## CI

- Push to `main` / `master` or tags `v*` → build and publish `ghcr.io/<owner>/<repo>:latest`
- Pull requests → build only (no push)

## License

Private project — use at your own risk.
