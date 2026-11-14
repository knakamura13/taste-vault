# Taste Vault infrastructure

This directory owns the complete Railway production environment for project
`1b4fcf83-538e-43e4-9e61-a5eb2bbd87d5`, environment
`26102b65-a559-47a6-97c8-d9e0ca42840d`. The configuration refuses other targets.

Install the pinned SDK without changing application dependencies:

```sh
npm ci --prefix .railway
railway config plan --environment 26102b65-a559-47a6-97c8-d9e0ca42840d
# Review the plan, then apply only with explicit approval for that exact plan.
```

Declared resources:

- Railway PostgreSQL, with database-managed persistent storage.
- `taste-vault` app service with one US West replica, Dockerfile build and supervised web/worker startup,
  startup migrations and a readiness check, private database URL reference,
  authentication required, and a 210 MB request limit.
- A 5000 MB screenshot volume mounted at `/data`; image keys resolve under
  `/data/images`.

This initializes infrastructure, not an application release. The app is connected to GitHub main, which currently contains only the scaffold. The functional application remains uncommitted locally. Before deploying it:

1. Review the locally tested Docker image and its shared web/worker volume.
2. Runtime credentials are managed outside source and preserved by this file.
   With required credentials absent, the application denies access with HTTP 503.
3. Set `ORIGIN` to the existing public HTTPS domain, then review the staged
   repository connection before deploying the tested source.
4. Verify migration, authentication, capture, and image persistence across restart.

No fixture images or local database contents are uploaded by this configuration.
Review every plan: whole-project IaC can delete resources omitted from the file.
Applying configuration is explicit; Railway does not read this directory during
ordinary source deployments. Generated Railway domains are managed separately.

Documentation: https://docs.railway.com/infrastructure-as-code

The configuration was applied on 2026-11-13. A subsequent plan still shows Railway retaining build.buildCommand (npm run build) instead of clearing it. Re-run and review the plan before any future apply. A whole-project apply can remove resources or variables not preserved here; do not apply it without reviewing the exact plan.
