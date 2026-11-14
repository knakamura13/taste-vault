# Interrupted intake and container verification

All tests used newly created disposable PostgreSQL databases and isolated image directories or Docker volumes. No user vault or hosted environment was changed.

## Interrupted intake

`tests/intake-interruption.mjs` drops an unfinished multipart connection, then kills and restarts the web server. It uses a temporary PostgreSQL trigger to pause insertion after the screenshot file is written, kills the server, terminates only the paused test transaction, and removes the trigger. Restart removes the uncommitted intake file. A subsequent committed image survives another forced restart byte for byte, and retrying that upload returns a duplicate warning.

The test also holds an active batch's shared advisory lock and observes the cleanup process blocked on its exclusive counterpart. Cleanup proceeds after release and preserves the saved image and an unrelated file.

The first harness run incorrectly expected an HTML redirect while using fetch's default Accept header, which receives an action response. The harness was corrected to send `Accept: text/html`; subsequent runs passed. This was a test-contract correction, not an application recovery failure.

## Container

The Node 24 Debian image built locally for arm64 with Chromium installed. `tests/container.mjs` verified:

- Fresh-database migrations before serving, and readiness with mounted writable image storage.
- Anonymous library/API/image requests rejected; authenticated web access allowed.
- Screenshot intake and exact byte retrieval.
- A queued public page captured by Chromium inside the container.
- Uploaded bytes preserved across a container restart with the same volume.
- Read API token denied description writes; write token accepted them.
- Unexpected worker termination caused supervisor exit code 1 and stopped the web child.

The test removes its container and volume after completion. Its database remains disposable test evidence. The Docker build emitted a heuristic secret warning for `TASTE_REQUIRE_AUTH=true`; this is a boolean switch, not a credential. Runtime credentials are supplied only at launch.

The complete 132-image intake suite also passed again with startup recovery enabled. Svelte check reported zero errors/warnings, the production build passed, and diff whitespace checks passed.

## Limits

This verifies local arm64 Docker behavior, not Railway deployment or HTTPS termination. Hosted authentication, persistent-volume placement, domain/origin configuration, and restored production data still need environment-specific verification. Startup orphan recovery deliberately covers only new batch-intake filenames participating in its lock protocol; it does not delete legacy, manual-attachment, or capture-worker files. The generated thumbnail cache remains disposable.

## Railway configuration reconciliation

A subsequent read-only Railway connector inspection found a production project with PostgreSQL, a 5000 MB `/data` volume, no application deployment or domain, and an older Railpack configuration. The local `.railway/railway.ts` was adjusted to use the tested Dockerfile and supervised startup, clear the former pre-deploy command, and configure `/healthz`. An authenticated `railway config plan` reported two updates and zero additions or deletions. The plan was not applied, and the local application remains uncommitted. Re-run and review the plan before any future infrastructure change, including preservation of credentials and other existing variables.
