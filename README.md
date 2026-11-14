# Taste Vault

Taste Vault is a single-user library for collecting design references. The local application includes screenshots, URL capture, projects, categories, search, reference management and a JSON API. Visual design is deliberately minimal while the workflows are being developed. See [the functional specification](docs/functional-spec.md) for the full product and trial criteria.

## Local setup

Install Node.js 22.17+, Docker Desktop and Google Chrome, then start Docker:

```sh
npm ci
docker compose up -d
npm run db:migrate
npm run dev
```

Open http://127.0.0.1:5173. In a second terminal, run the capture worker to process URL-only references:

```sh
npm run capture:worker
```

The worker uses Chrome at its standard macOS location or `/usr/bin/chromium` on Linux. Set `CHROME_PATH` if your browser is elsewhere. Jobs remain in PostgreSQL while the worker is stopped and resume on restart. The worker uses a filtering proxy for browser requests, permits public HTTP(S) destinations on ports 80 and 443, and rejects private and local network addresses. If live capture fails, it attempts to use an existing Wayback snapshot. A failed reference remains available for retry or manual upload.

Defaults live in `.env.example`. Copy it to `.env` to set `DATABASE_URL` or `TASTE_STORAGE_DIR` (an absolute path or a path relative to this checkout). Restart the server and worker after changes. Images and generated thumbnail previews live in that directory; keys in the database are relative. The built server defaults to a 210 MB request limit for batches. Set `BODY_SIZE_LIMIT` to override it:

```sh
npm run build
npm run start:local
```

`npm start` also binds to localhost by default. Local mode has no authentication, so keep it on your own machine. Migration files are applied once in order, under a PostgreSQL advisory lock. Run `npm run db:migrate` after updating the application and before restarting it.

## Application and API

The gallery supports search, project and category filters, pagination, and copying selected reference IDs. Batch intake supports defaults, per-item overrides, and grouping selected screenshots under one reference. Create projects and categories from their pages. Reference details support edits, assignments, additional screenshots, approved descriptions, capture retry and Trash. Projects can be archived without changing their assignments; Trash can be restored or permanently deleted.

The local API exposes:

- `GET /api/v1/references?q=...&project=...&limit=...&cursor=...` — project plus general references, or general references when project is omitted.
- `GET /api/v1/references/REF-000001` — reference details and image links.
- `GET /api/v1/references/REF-000001/screenshots/SCREENSHOT_UUID` — image bytes.
- `PUT /api/v1/references/REF-000001/screenshots/SCREENSHOT_UUID/description` — JSON `{ "description": "...", "approved": true }`.

Responses use JSON errors and stable IDs. Search pages are bounded, with `nextCursor` for the next page.

### Remote access configuration

The built server requires authentication when `HOST` is not localhost, or when `TASTE_REQUIRE_AUTH=true`. Set `TASTE_WEB_PASSWORD`, `TASTE_API_READ_TOKEN`, and a different `TASTE_API_WRITE_TOKEN` before binding to another interface. The gallery and assets use HTTP Basic authentication (username `taste`, configurable with `TASTE_WEB_USER`); API requests use a Bearer token. The write token also grants read access, while the read token cannot write. Put the server behind HTTPS before remote access; Basic credentials and Bearer tokens must not travel over plain HTTP. Deployment and reverse-proxy configuration have not yet been validated on Railway.

## Backup and restore

Stop the web server and capture worker, and pause all other writers. Save a PostgreSQL dump and the entire image directory together. For the default Docker setup:

```sh
mkdir -p /path/to/backup
docker compose exec -T db pg_dump -U taste -Fc taste_vault > /path/to/backup/vault.dump
cp -R .taste-vault/images /path/to/backup/images
```

Restore the dump into a **new empty database** with `pg_restore`, restore the matching image directory, and set `DATABASE_URL` and `TASTE_STORAGE_DIR`. PostgreSQL dumps include the reference sequence state. Run `npm run db:migrate` to apply migrations added since the backup, then verify the images and IDs before allowing writes. Keep the dump and images from the same paused snapshot.

## Tests

`npm run check` and `npm run build` validate the build. The integration scripts under `tests/` require a **disposable**, migrated PostgreSQL database. Set `DATABASE_URL` to that database and `TASTE_STORAGE_DIR` to a disposable directory before running them. `npm run test:trial`, `npm run test:auth`, and `npm run test:capture` exercise the main workflows; the capture test also requires Chrome and external network access. `node tests/capture-flow.mjs` exercises fallback logic without network access. See [the performance baseline](docs/benchmarks/README.md) for its scope and limits.

## Assistant search

The existing read-only command and optional skill are described in [skills/taste/SKILL.md](skills/taste/SKILL.md). Finishing the application takes priority over installing or refining the skill.

### Supplied-image intake recovery

`npm run test:intake` requires an empty migrated database named `taste_intake_test_<suffix>`, empty `TASTE_STORAGE_DIR`, `CHROME_PATH`, and `TASTE_FIXTURE_DIR` pointing to at least 20 PNGs (each at most 10 MiB). It imports every source through the real HTTP form and standard startup script. It verifies byte preservation, duplicate confirmation, oversized/corrupt/count rejection, filesystem and database rollback after a later assignment fails, and browser draft recovery/removal at 320px. Use only disposable test data and storage. Source files are read only.

## Deployment package and crash recovery

See [container deployment](docs/deployment.md) for the Docker image, runtime variables, readiness checks, and Railway setup. Standard startup reconciles interrupted batch image writes before listening. `npm run test:interruption` uses an empty migrated database named `taste_interrupt_test_<suffix>` and empty temporary storage to test dropped uploads and forced process restarts.
