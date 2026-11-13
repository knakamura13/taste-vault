# Taste Vault

Taste Vault is a personal library of design references for use in Claude Code and Codex. See the [functional specification](docs/functional-spec.md) for the local trial and the planned Railway deployment.

## Run the scaffold

Use Node.js 22.17 or later and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The starter has placeholder pages for the gallery, intake, reference details, projects, categories, and Trash. TypeScript data model stubs live in `src/lib/vault.ts`.

```sh
npm run check
npm run build
npm run start:local
```

The built server starts on http://127.0.0.1:3000. The scaffold runs without database setup or credentials. For the eventual Railway service, `npm start` starts the Node server and accepts the runtime's `HOST`, `PORT`, and `ORIGIN` settings.
