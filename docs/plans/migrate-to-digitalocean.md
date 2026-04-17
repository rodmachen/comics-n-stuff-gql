# Plan: Migrate DB + API to DigitalOcean Droplet

> **Filename note**: This plan was authored as `compressed-whistling-mountain.md` (auto-generated). The user has confirmed the rename to **`migrate-to-digitalocean.md`** — the first action of Step 0 is `git mv docs/plans/compressed-whistling-mountain.md docs/plans/migrate-to-digitalocean.md` before any commits.

## Context

**Problem.** The project currently runs on:
- **Supabase** (free tier) for Postgres
- **Railway** (~$5/mo credit) for the Apollo/Express API

Supabase's free tier caps at 2 active projects. Adding a third personal project forces an upgrade to $25/mo base + $10/project — a jump from **$0 → $35/mo** for the database alone. The user has already paused this project's Supabase instance to stay under the cap, which is not sustainable.

**Driver.** Consolidate onto a single DigitalOcean droplet to (a) eliminate the Supabase cost pressure, (b) support multiple current and future personal projects on one host, and (c) simplify the stack to one platform. Target spend is **$12/mo** on a 2GB / 1vCPU / 50GB droplet, replacing both Supabase ($0 today, $35 at capacity) and Railway (~$5/mo).

**Intended outcome.**
- Postgres running in Docker on the droplet, holding the GCD-derived DC comics dataset and free DB slots for future projects
- The comics-gql Apollo API running in the same Docker Compose stack, talking to Postgres over the internal network (localhost-private)
- PgBouncer exposed on a public port (TLS) so **future Vercel-hosted Next.js projects** can hit Postgres without exhausting connections
- Caddy as a reverse proxy for automatic Let's Encrypt TLS
- Supabase instance deleted, Railway service shut down

**Out of scope.** Rewriting any application code, changing the GraphQL schema, migrating to a different ORM, or building new APIs. This plan is purely infrastructure.

## Architecture

```
                          ┌─────────────────────────────────┐
                          │   DigitalOcean Droplet (2GB)    │
                          │   Ubuntu 24.04 LTS              │
                          │                                 │
  Frontend (Vercel)  ───► │  Caddy :443  (auto-TLS)         │
  https://dcdecade.com    │     │                           │
                          │     ▼                           │
                          │   api:4000  (comics-gql)        │
                          │     │                           │
                          │     ▼                           │
                          │   postgres:5432  (internal only)│
                          │     ▲                           │
                          │     │                           │
                          │   pgbouncer:6432 (public TLS)  ◄──── Future Vercel
                          │                                 │    Next.js projects
                          └─────────────────────────────────┘
```

- `postgres` container: listens on the internal Docker network only. Local API and PgBouncer talk to it.
- `pgbouncer` container: published on droplet's public :6432 with TLS + strong auth, transaction-mode pooling.
- `caddy` container: terminates TLS for the API subdomain(s).
- Per-DB Postgres roles for isolation; one DB per personal project.

## Prerequisites

- DigitalOcean account with billing set up
- DNS control for `dcdecade.com` (to add the `api.dcdecade.com` A-record); future personal projects can use additional subdomains under whatever domain you choose at that time
- Existing GitHub repo (already connected — currently auto-deploys to Railway)
- Local machine with `psql` 17 installed (Homebrew already has `/opt/homebrew/opt/postgresql@17/bin/psql` per `scripts/migrate-to-postgres.py`)
- Current Supabase `DATABASE_URL` kept for the duration of the migration (used to `pg_dump` the live data)

---

## Step 0 — Project init, branch setup, and CI bootstrap ✅

**Model/Effort**: **Sonnet / medium**
**Justification**: Mostly routine (branch, PR), but **the repo has no `.github/workflows/` today** — CI must be added before any implementation per the global workflow rules. A CI workflow is simple but has enough correctness surface (Node version, Prisma generate, env stubs) that Haiku is under-tooled. Not novel enough for high effort.
**Context-clear**: no
**TDD/tests-alongside**: tests-alongside (CI itself is verified by running it, not TDD)
**Files modified** (new):
- `.github/workflows/ci.yml`

Actions:
1. Confirm repo is clean (`git status`), on `main`, pulled to latest
2. Create feature branch `feature/migrate-to-digitalocean`
3. **Add `.github/workflows/ci.yml`** running on PR and pushes to `main`:
   - Node 24 (matches `Dockerfile`)
   - `npm ci`
   - `npx prisma generate`
   - `npm run lint`
   - `npm test` (vitest; the current tests don't require a live DB — verify during authoring that they actually pass without `DATABASE_URL`, and if any require a DB, add a Postgres service container to the workflow)
4. Push the branch; verify the workflow runs green on the initial push
5. Open a draft PR against `main`; link to this plan

**Verify**:
- `git branch --show-current` returns `feature/migrate-to-digitalocean`
- GitHub Actions tab shows the `ci` workflow running green on the branch's latest commit
- `gh pr list --head feature/migrate-to-digitalocean` shows the draft PR

---

## Step 1 — Droplet provisioning & SSH hardening ✅

**Model/Effort**: **Sonnet / medium**
**Justification**: Well-trodden Linux ops but mistakes here have outsized blast radius (exposed SSH, broken firewall). Worth careful execution; not novel enough for high effort.
**Context-clear**: no
**TDD/tests-alongside**: tests-alongside (verification by SSH + `ufw status`, not automated tests)
**Files modified**: new `ops/droplet-bootstrap.md` (runbook in repo); no application code

Actions:
1. Create a 2GB / 1 vCPU / 50GB / Ubuntu 24.04 droplet in a nearby region
2. Add SSH key at creation time; disable password auth in `/etc/ssh/sshd_config`
3. Create non-root sudo user; disable root login
4. Configure `ufw`: allow 22, 80, 443, 6432. Deny all else inbound.
5. Install `fail2ban` (defaults cover SSH; Postgres jail added later)
6. Enable `unattended-upgrades` for security patches
7. Install Docker Engine + Docker Compose plugin from Docker's official apt repo (not Ubuntu's older version)
8. Add runbook `ops/droplet-bootstrap.md` documenting these steps so they're reproducible

**Verify**:
- `ssh user@droplet` works with key; `ssh root@droplet` is denied
- `ufw status` shows only 22, 80, 443, 6432 allowed
- `docker run hello-world` succeeds from the sudo user
- `sudo systemctl status fail2ban` shows active

---

## Step 2 — DNS + Docker Compose skeleton (Postgres, PgBouncer, Caddy) ✅

**Model/Effort**: **Sonnet / high**
**Justification**: PgBouncer transaction-pool mode with Prisma has a known footgun (prepared statements); Caddy TLS needs correct DNS-first sequencing. Medium-high ambiguity because choices here constrain later steps — wrong pool mode breaks Prisma, wrong Caddy config leaves HTTPS broken until the next deploy.
**Context-clear**: yes (distinct chapter — infrastructure configuration, benefits from fresh context)
**TDD/tests-alongside**: tests-alongside
**Files modified** (new):
- `ops/compose/docker-compose.yml`
- `ops/compose/Caddyfile`
- `ops/compose/pgbouncer/userlist.txt.example` (template; real file is gitignored)
- `ops/compose/postgres/init/00-init.sh` (creates DB, role, pg_trgm extension)
- `ops/compose/pgbouncer/pgbouncer.ini`
- `ops/compose/.env.example`
- `.gitignore` (add `ops/compose/.env`, `ops/compose/pgbouncer/userlist.txt`)

Actions:
1. Point `api.dcdecade.com` A-record at droplet IP (wait for propagation)
2. Author `docker-compose.yml` with three services:
   - `postgres:17` — named volume `pgdata`, no published ports (internal only), healthcheck via `pg_isready`
   - `pgbouncer` (edoburu/pgbouncer image) — publishes `6432:6432`, transaction pool mode, `MAX_CLIENT_CONN=200`, `DEFAULT_POOL_SIZE=20`, requires TLS with a self-signed or Let's Encrypt cert mounted in
   - `caddy:2` — publishes `80:80` and `443:443`, volume-mounts `Caddyfile` and a cert data volume
3. Caddyfile routes `api.dcdecade.com` → `api:4000` (the API container added in Step 4). For now, a placeholder `respond "ok"` so Caddy can acquire certificates before the API exists.
4. Initialize Postgres with an init script that:
   - Creates `CREATE EXTENSION pg_trgm;` — **required** by the existing GIN indexes in `prisma/schema.prisma` (lines 81, 133, 295)
   - Creates database `comics_gcd` and role `comics_app` with `CONNECT` grant
5. PgBouncer auth: `userlist.txt` with scrypt-hashed passwords, one entry per app role
6. `ops/compose/.env.example` documents required variables; `.env` is gitignored

**Verify**:
- `docker compose up -d` brings all three services to `healthy`
- `curl -I https://api.dcdecade.com` returns 200 (Caddy placeholder) with a valid Let's Encrypt cert
- From the droplet: `docker exec -it postgres psql -U comics_app -d comics_gcd -c "SELECT extname FROM pg_extension;"` lists `pg_trgm`
- From the droplet: `psql -h 127.0.0.1 -p 6432 -U comics_app -d comics_gcd -c "SELECT 1"` succeeds through PgBouncer
- From the laptop: `psql "postgres://comics_app:pw@<droplet-ip>:6432/comics_gcd?sslmode=require" -c "SELECT 1"` succeeds

---

## Step 3 — Migrate GCD data into the droplet's Postgres ✅

**Model/Effort**: **Sonnet / high**
**Justification**: Data correctness is load-bearing for the entire application; mistakes compound (bad import → broken GraphQL queries → no way to verify App behavior). Re-running `migrate-to-postgres.py` is well-understood, but the *target* is now a remote droplet with pooling, which changes error surface. Also need to re-apply Prisma migrations (trigram GIN indexes + cover image fields) and verify index integrity.
**Context-clear**: no (builds directly on Step 2's infrastructure)
**TDD/tests-alongside**: tests-alongside (verification via row counts + existing vitest integration tests pointed at the new DB)
**Files modified**:
- `scripts/migrate-to-postgres.py` — **review only**; likely no changes needed, but the `PSQL` hardcoded path (`/opt/homebrew/opt/postgresql@17/bin/psql`) runs locally, which is correct. It writes to `scripts/dc-comics-postgres.sql`, then loads with `psql`. We override the target via env or CLI.
- Possibly a small wrapper: `scripts/load-to-remote.sh`

Actions:
1. On the laptop, run `scripts/migrate-to-postgres.py` to regenerate `scripts/dc-comics-postgres.sql` (filtered to DC, publisher_id=54) from `2026-02-15.sql`. This already works; just re-run for freshness.
2. Pipe the generated SQL to the droplet's Postgres through PgBouncer is **wrong** for bulk loads (transaction mode breaks prepared statements for some pg clients; also bypasses pooling benefits). Instead:
   - Use **direct Postgres port** temporarily by SSH-tunneling: `ssh -L 15432:localhost:5432 droplet` then `psql -h localhost -p 15432 -U comics_app -d comics_gcd -f scripts/dc-comics-postgres.sql`
   - **Alternative**: `scp` the SQL file up and run `psql` on the droplet itself (faster, avoids laptop-to-droplet transfer during import)
3. After data load, run `npx prisma migrate deploy` pointed at the droplet (via SSH tunnel) to apply:
   - `20260227180905_add_indexes` (the trigram GIN indexes)
   - `20260227181500_add_cover_image_fields`
4. Run `ANALYZE;` on the whole DB
5. Compare row counts against Supabase: `SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;` on both, diff results

**Verify**:
- Row counts for `gcd_publisher`, `gcd_series`, `gcd_issue`, `gcd_story`, `gcd_story_credit`, `gcd_creator`, `gcd_creator_name_detail` match Supabase within expected tolerance (exact match if dumps are from the same source)
- `\di+ idx_series_name_trgm` shows the GIN index exists and has non-zero size
- A sample trigram search query returns results in reasonable time: `EXPLAIN ANALYZE SELECT id, name FROM gcd_series WHERE name %> 'Batman' ORDER BY name <-> 'Batman' LIMIT 10;` uses the GIN index
- Existing vitest integration tests (`npm test`) pass when pointed at the droplet's DB

---

## Step 4 — Deploy API container on droplet + DNS cutover

**Model/Effort**: **Sonnet / medium**
**Justification**: The existing `Dockerfile` already works (deployed on Railway). Moving it into the droplet's Compose stack is mechanical. Main risk is env-var mistakes (credentials, CORS), which are easy to diagnose.
**Context-clear**: yes (distinct chapter — cutover, benefits from fresh focus on DNS and traffic migration)
**TDD/tests-alongside**: tests-alongside
**Files modified**:
- `ops/compose/docker-compose.yml` — add `api` service
- `ops/compose/Caddyfile` — replace placeholder with reverse-proxy route
- `.env.example` — update comment: drop Supabase-specific vars, note droplet connection shape
- `docs/plans/deploy-api.md` — add a "Superseded" note pointing to this plan

Actions:
1. Add `api` service to `docker-compose.yml`:
   - Build from the repo's existing `Dockerfile`
   - `DATABASE_URL=postgres://comics_app:pw@postgres:5432/comics_gcd` (internal network, no SSL needed, no PgBouncer for this API — it's long-lived and has its own pool)
   - `DIRECT_DATABASE_URL` removed (was only for Supabase's dual-URL pattern)
   - `CORS_ORIGINS` matches Railway's current value (`https://dcdecade.com,...`)
   - `NODE_ENV=production`, `LOG_LEVEL=info`, `PORT=4000`
2. Update `Caddyfile` to `api.dcdecade.com { reverse_proxy api:4000 }`
3. Deploy: `docker compose up -d --build api` + `docker compose exec caddy caddy reload`
4. Smoke test against droplet URL before cutover:
   - `curl https://api.dcdecade.com/health` returns `{"status":"ok"}`
   - `curl -X POST https://api.dcdecade.com/graphql -H 'Content-Type: application/json' -d '{"query":"{ publishers(limit:1) { items { name } } }"}'` returns real data
5. **Cutover**: swap the frontend's API base URL from `comics-n-stuff-gql-production.up.railway.app` → `api.dcdecade.com`. Update `CORS_ORIGINS` if the frontend URL changes.
6. Keep Railway running for 24–48h as rollback insurance

**Verify**:
- `/health` and GraphQL endpoint both green from outside the droplet
- Frontend (dcdecade.com) loads and performs a trigram search against the new API
- `docker compose logs api` shows normal traffic; no error spikes
- Pino logs on droplet reflect real request volume

---

## Step 5 — Decommission Supabase + Railway

**Model/Effort**: **Haiku / medium**
**Justification**: Simple cleanup, but includes destructive actions (deleting the Supabase project) that must only happen after confirming Step 4 is stable. Mechanical, low ambiguity.
**Context-clear**: no
**TDD/tests-alongside**: n/a
**Files modified**:
- `.env.example` — remove Supabase-specific vars, replace with droplet-shaped example
- `docs/plans/deploy-api.md` — mark "Superseded by `compressed-whistling-mountain.md`"
- Optional: `README.md` hosting section if one exists

Actions:
1. **After 48h stable** on droplet with real frontend traffic:
   - Delete the Railway service (`railway.app` dashboard)
   - Take a final `pg_dump` of the Supabase DB to laptop as a belt-and-braces backup, then delete the Supabase project
2. Remove Supabase references from `.env.example` and any docs

**Verify**:
- Railway dashboard shows no running service
- Supabase dashboard shows no active project
- `grep -r supabase` in repo returns only historical-doc references (deploy-api.md), not active config

---

## Step 6 — Ops baseline (backups, monitoring, update workflow)

**Model/Effort**: **Sonnet / high**
**Justification**: Three sub-pieces (backups, monitoring, GH-Actions auto-deploy). The GH-Actions deploy adds real surface: secret management, SSH key generation/restriction, idempotent rebuild script, rollback path. Each is load-bearing for either recovery or daily iteration — silent failures here only surface during incidents. Justifies high effort.
**Context-clear**: no
**TDD/tests-alongside**: tests-alongside (verified by doing a trial restore + a real PR-merge deploy)
**Files modified** (new):
- `ops/backup/pg-dump.sh`
- `ops/backup/pg-dump.service` + `pg-dump.timer` (systemd) OR crontab entry documented in runbook
- `ops/monitoring/disk-check.sh`
- `ops/droplet-bootstrap.md` — extend runbook
- `.github/workflows/deploy.yml` — auto-deploy on push to `main`

Actions:
1. **Backups**:
   - For `comics_gcd`: no scheduled backup needed (static data; source of truth is `2026-02-15.sql` + `migrate-to-postgres.py`). Note this explicitly in runbook.
   - For *other* personal DBs (when they exist): weekly `pg_dump` → `/var/backups/postgres/` on the droplet, retain 4 weeks. Weekly `scp` or `rclone` pull to laptop for off-box copy.
   - Optional: DO weekly droplet snapshot (~$1/mo for this size) for whole-box DR
2. **Monitoring**:
   - `disk-check.sh` warns via login MOTD when `/` > 80%
   - `docker compose logs` retention: Docker's json-file driver set to `max-size=10m max-file=3`
3. **Auto-deploy via GitHub Actions** (`.github/workflows/deploy.yml`):
   - Generate a deploy-only SSH keypair on the droplet; restrict the public key in `~/.ssh/authorized_keys` with `command="cd /opt/stack && git pull && docker compose up -d --build api",no-port-forwarding,no-X11-forwarding,no-agent-forwarding`
   - Add private key + droplet host as GitHub Actions secrets (`DEPLOY_SSH_KEY`, `DROPLET_HOST`, `DROPLET_USER`)
   - Workflow triggers on push to `main` (after CI green), connects via SSH, runs the restricted command
   - Rollback: documented manual path (`git checkout <prev-sha>` on droplet + rebuild)
4. **Trial restore**: Once a second personal DB exists, wipe it, restore from the most recent backup. Time the operation. (For now, the verify step uses a throwaway DB.)

**Verify**:
- `sudo systemctl list-timers` shows the backup timer scheduled (or `crontab -l` shows it)
- A manual invocation produces a non-empty `.sql.gz` in `/var/backups/postgres/`
- Disk check script returns non-error exit when tested against an artificially small threshold
- Deploy workflow: a trivial commit pushed to `main` (e.g., comment-only change in `src/index.ts`) triggers the workflow, the API container rebuilds on the droplet, `/health` stays green throughout, and the change is observable in `docker compose logs api`
- The restricted SSH key cannot be used to run anything other than the deploy command (verify by attempting `ssh -i <key> droplet ls` — should fail)

---

## Verification — End-to-end

Once all steps complete, run this end-to-end check:

1. **Frontend-to-DB path** (user-visible):
   - Load `dcdecade.com`
   - Perform a trigram search (e.g., "Batman")
   - Confirm results return in <500ms (warm cache)
2. **Test suite** (automated):
   - Locally: `export DATABASE_URL="postgres://...@<droplet-ip>:6432/comics_gcd?sslmode=require&pgbouncer=true"` then `npm test`
   - All vitest tests pass
3. **Second-DB readiness** (proves multi-tenancy):
   - On droplet: `createdb demo_project`; create role; confirm `psql` login from laptop through PgBouncer succeeds
   - Drop it afterward; confirm no leftover state
4. **Monitoring**:
   - `df -h` on droplet shows > 20GB free after all of the above
   - `free -h` shows Postgres has page-cache headroom
5. **Cost**:
   - DO billing shows 1 droplet at $12/mo
   - Railway and Supabase both absent from billing

## Critical files / references

- `prisma/schema.prisma` (lines 81, 133, 295) — `gin_trgm_ops` indexes that require `pg_trgm` extension in the new DB
- `prisma/migrations/20260227180905_add_indexes/` and `20260227181500_add_cover_image_fields/` — to be applied via `prisma migrate deploy`
- `Dockerfile` — reused as-is for the `api` container
- `src/index.ts:45-47` — CORS origin logic driven by `CORS_ORIGINS` env var
- `src/index.ts:49-51` — `/health` endpoint (Caddy/healthcheck target)
- `scripts/migrate-to-postgres.py` — existing MySQL-dump-to-Postgres pipeline, **reuse unchanged**
- `scripts/dc-comics-postgres.sql` — output of the above, ~2.25M lines
- `docs/plans/deploy-api.md` — prior Railway deploy plan, to be marked superseded

## Decisions confirmed with user

- **Plan filename** → rename to `migrate-to-digitalocean.md` (first action of Step 0)
- **API domain** → `api.dcdecade.com`
- **Deploy flow** → GitHub Actions auto-deploy (locked into Step 6)
- **Data scope** → DC-only (matches current Supabase state; full GCD is a separate future project)

## Remaining open items (non-blocking; pick during execution)

1. **DO region** — pick nearest to user during droplet creation (NYC3/SFO3/etc.). Latency to the frontend matters less here than to the user doing ops.
2. **Git branch name** — proposed `feature/migrate-to-digitalocean`. Override if you prefer.

## Post-implementation

Once this plan is complete and merged:
1. Update the project README with the new API URL if it changes
2. The existing frontend repo (dcdecade) needs its API base URL updated — coordinate the merge
3. Post-merge: `git checkout main && git pull && git branch -d feature/migrate-to-digitalocean`

## Cost summary

| Item | Before | After |
|---|---|---|
| Supabase (2 free + 1 paid) | $0 (paused) / $35 (active) | $0 |
| Railway | ~$5/mo (free credit) | $0 |
| DigitalOcean droplet | $0 | $12/mo |
| DO weekly snapshots (optional) | $0 | ~$1/mo |
| **Total** | **$5–$35/mo** | **$12–$13/mo** |

Breakeven is immediate against the $35 Supabase scenario; ~$7/mo premium over the current paused $5 state, in exchange for being able to unpause the project and add more personal projects without platform friction.
