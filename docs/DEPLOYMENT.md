# Deployment

Target topology: **Railway** runs backend + worker + Postgres + Redis (plus a
volume for DuckDB/uploads shared is NOT possible across Railway services — see
the volume note below); **Vercel** serves the frontend SPA.

## One-time prerequisites

```bash
railway login     # opens browser
vercel login      # opens browser
```

## Railway (backend stack)

```bash
railway init --name dataforge          # create project (run at repo root)
railway add --database postgres
railway add --database redis

# Backend service (builds backend/Dockerfile)
railway add --service backend --repo muneeb7777/dataforge
#   root directory: backend
#   start command:
#     sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT"
#   variables:
#     DATABASE_URL      = postgresql+asyncpg://<from railway postgres>
#     SYNC_DATABASE_URL = postgresql+psycopg://<from railway postgres>
#     REDIS_URL         = ${{Redis.REDIS_URL}}
#     ENVIRONMENT       = production
#     CORS_ORIGINS      = https://<your-vercel-domain>
#     JWT_SECRET        = <generate a long random string>
#     UPLOAD_DIR        = /data/uploads
#     DUCKDB_DIR        = /data/duckdb
#   attach a volume mounted at /data

# Worker service: same repo/root/variables, start command:
#     celery -A app.core.celery_app worker -B --loglevel=info --pool=solo
#   attach its own volume at /data

railway domain                          # mint the public backend URL
```

**Volume caveat:** Railway volumes are per-service. The backend and worker
cannot share one DuckDB file there, so on Railway either (a) run only the
backend and skip the worker (exports/FRED disabled — everything else works), or
(b) accept that worker exports read a *separate* DuckDB replica and FRED data
lands in the worker's file. For a small deployment, option (a) is the honest
default; the full stack runs as designed on any single host with
`docker compose up` (a $5 VPS works fine).

## Vercel (frontend)

```bash
cd frontend
vercel link                             # create/link project
vercel env add VITE_API_URL production  # value: https://<railway-backend-domain>
vercel --prod
```

Then set `CORS_ORIGINS` on the Railway backend to the Vercel domain and
redeploy the backend.

## Post-deploy smoke test

1. `curl https://<backend>/health` → `{"status":"ok",...}`
2. Open the Vercel URL, register a user, upload a CSV, preview it.
3. `POST /api/explore/query` a `SELECT` via the UI.
