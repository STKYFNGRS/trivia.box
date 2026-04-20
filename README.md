# trivia.box

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)

Bar trivia platform for **hosts** and **venues** ($50/month, Stripe). Stack: **Next.js 15**, **Neon + Drizzle**, **Clerk**, **Ably**, **Sentry**, **PostHog**, **Upstash Ratelimit**.

> The CI badge above points at `OWNER/REPO` — swap for the real `github.com/<org>/<repo>` slug once the repo is pushed. Enable branch protection on `main` requiring the `verify` check.

## Quick start

```bash
npm install
cp .env.example .env.local
# Fill .env.local — see .env.example for all keys

npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Maintainer note (local guide)

A **living project guide** (goals, env verification, status, backlog, changelog) is kept locally at **`resources/PROJECT_GUIDE.md`**. The `resources/` folder is **gitignored** on purpose — it is not in the remote repo. Agents should read and update that file each session; back it up yourself if you need a copy elsewhere.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run db:generate` | Drizzle: generate migration |
| `npm run db:migrate` | Drizzle: apply migrations |
| `npm run db:push` | Drizzle: push schema (dev) |
| `npm run db:seed` | Seed sample questions |
| `npm run db:studio` | Drizzle Studio |

## Repo

[github.com/STKYFNGRS/trivia.box](https://github.com/STKYFNGRS/trivia.box)
