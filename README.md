# JoJobuddy

Personal AI resume stand: **Star Platinum** rewrites to the JD, **Heaven's Door** scores ATS fit.

## Stack

- Next.js 16 + React 19 + Tailwind CSS 4
- MongoDB
- Background worker for URL parse / resume craft

## Local development

```bash
cp .env.example .env.local
# set MONGODB_URI, AUTH_SECRET

docker compose up -d mongo
npm install
npm run dev:web      # terminal 1
npm run dev:worker   # terminal 2
```

Open http://localhost:3000

## Docker

Same image runs as `web` or `worker` via `JOJOBUDDY_ROLE`.

```bash
cp .env.example .env
# set AUTH_SECRET (and optional Google OAuth)

docker compose up -d --build
```

Pull a published image (after CI):

```bash
export JOJOBUDDY_IMAGE=ghcr.io/goagain/jojobuddy:latest
docker compose up -d
```

## CI/CD

Push to `main` / `master` or tag `v*` builds and publishes to GitHub Container Registry:

`ghcr.io/<owner>/<repo>:latest`

Pull requests only build (no push).

## License

Private project tools — use at your own risk.
