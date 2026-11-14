# Container deployment

The Docker image contains the production Node build, Chromium, migrations, and a supervisor that runs the web server and capture worker against the same storage directory. Startup applies migrations before opening the server, and the server reconciles interrupted batch files before listening. A failure of either long-running child stops the container. SIGTERM is forwarded with a 25-second shutdown deadline.

## Required runtime configuration

- `DATABASE_URL`: PostgreSQL connection string, using the private network on Railway.
- `ORIGIN`: exact public HTTPS origin, including scheme.
- `TASTE_WEB_PASSWORD`, `TASTE_API_READ_TOKEN`, `TASTE_API_WRITE_TOKEN`: distinct generated secrets (read and write tokens must differ).
- Mount persistent storage at `/data`; image storage defaults to `/data/images`.
- Optional `TASTE_WEB_USER` (default `taste`), `PORT` (default `3000`), and `BODY_SIZE_LIMIT` (default `210M`).

The image binds to `0.0.0.0`, requires authentication, and runs one web process and one capture worker. Use one replica. A capture worker lock prevents competing workers against the same database. Do not run this image against an existing local vault until its database and matching image directory have been restored together and verified.

`GET /healthz` exposes only `ready` or `unavailable`; it checks database schema access and readable/writable storage. When authentication is required, missing credentials keep this route unavailable too. All library routes and images remain authenticated. The readiness route does not exercise a live browser capture on each request.

## Local build

```sh
docker build -t taste-vault:local-trial .
# Supply runtime variables through an untracked environment file.
docker run --rm --env-file /path/to/runtime.env \
  -p 127.0.0.1:3000:3000 -v taste-vault-images:/data taste-vault:local-trial
```

Use a separate test database and volume for trials. On Docker Desktop, a host PostgreSQL service can be addressed through `host.docker.internal`. Set `ORIGIN=http://127.0.0.1:3000` only for a localhost-bound test.

## Railway setup

Deploy the Dockerfile with PostgreSQL and one attached volume mounted at `/data`. Set the variables above, with `ORIGIN` matching the generated/custom HTTPS domain. The local `.railway/railway.ts` declares the Dockerfile and `/healthz` readiness check. Review a Railway plan before applying it. Startup handles migrations and file recovery after the volume is mounted; no volume work belongs in a pre-deploy command. Railway documents that [pre-deploy commands run separately without the mounted volume](https://docs.railway.com/deployments/pre-deploy-command) and that [volume-backed deployments have brief redeploy downtime](https://docs.railway.com/deployments/healthchecks).

The Railway project, volume, and public domain exist. The Dockerfile builder, supervisor, and health check were applied, but Railway retained an old build-command value that still appears in the configuration plan. The first deployment failed because GitHub main contains only the scaffold and does not contain the local Dockerfile or application. Hosted verification remains pending publishing the tested source and configuring runtime credentials and origin. Verify HTTPS/authentication, restored reference IDs and image bytes, capture execution, process restart persistence, and read/write API permissions in the actual environment before marking deployment complete.

## Interrupted intake recovery

New batch screenshots use `intake-<uuid>.<extension>` filenames. A batch holds a shared PostgreSQL transaction advisory lock from before writing through commit. Startup cleanup takes the exclusive counterpart, waits for active batches, and removes only matching files with no committed screenshot row. Saved images, legacy files, worker captures, and unrelated files are left alone. This repairs a process crash between batch file creation and database commit, without trying to infer orphan status from file age. Run through `npm start` (or the container supervisor) to enable startup recovery; directly invoking `node build` bypasses it.

## Repeatable container smoke test

After building `taste-vault:local-trial`, create a fresh empty PostgreSQL database named `taste_container_test<suffix>` and run `DATABASE_URL=... npm run test:container`. The test creates a unique container and named volume, binds only localhost port 39379, verifies migrations/authentication/upload/capture/restart/API permissions/worker failure propagation, then removes its container and volume. It requires Docker Desktop, access to the database through `host.docker.internal`, and public network access for the example.com capture. Keep the database disposable. See [local verification evidence](trials/2026-11-13-restart-container.md).
