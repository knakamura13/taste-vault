# Taste Vault functional specification

## Purpose

Taste Vault is a single-user SvelteKit app for collecting design references and using them in Claude Code and Codex. Start with a local trial, then move the same vault to Railway after a few days of real use. The supplied screenshots guide the gallery workflow. Visual design is a separate pass.

## Save references

- Add one or more screenshots, web page URLs, or both in a single batch. A screenshot or URL is enough to save. Set optional project and category defaults for the batch and override or clear them on individual items.
- Create one reference per screenshot or URL by default. Explicitly group related screenshots, such as desktop and mobile views, under one reference ID. Explicitly attach a URL to one or more screenshots to use it as their source. A supplied screenshot fulfills capture for its reference.
- Generate a title locally using a descriptive filename or URL clues. For generic filenames, use a numbered, dated fallback such as `Screenshot 000001 · 2026-11-13`. Allow a custom title at creation and edits later. The title stays independent of the permanent ID.
- Use a stable, monotonically allocated reference ID for task pins. The scaffold uses `REF-000001` as the example format, with six digits as minimum padding. IDs survive edits, added screenshots, moves, and restores. A permanent deletion leaves the ID retired.
- Flag exact image matches and previously saved URLs, including matches inside the batch. Let the user open an existing reference or deliberately save a new one. One URL can have several references representing different designs over time.

## Capture web pages

- Persist URL-only references immediately. Queue capture in the background and show progress or an outcome on the reference. Use a fresh browser session to capture one desktop viewport of a public page. Accept a manual upload for pages behind a login, mobile views, or full-page screenshots.
- After a failed live capture for an eligible public page, automatically look for an existing Wayback snapshot and screenshot its replay. Record the original URL, replay URL, archive timestamp, and screenshot capture time. Show the archive date alongside the image. An archive may be missing or may render with missing assets. [Wayback Availability API](https://archive.org/help/wayback_api.php) · [Internet Archive help](https://help.archive.org/help/using-the-wayback-machine/)
- If capture fails, keep the reference and display the reason when available. Offer **Retry** and **Upload Screenshot**. Retrying or attaching a screenshot preserves the reference ID and metadata.
- Keep capture jobs in PostgreSQL so pending work can resume after a restart. Repeated processing of the same job should produce at most one accepted image. Capture is for public HTTP(S) pages. Reject local and private network targets for live capture and archive lookups. Limit Wayback to existing snapshots.

## Browse and manage the vault

- Open to **All References**, newest first. Show the reference count, screenshot previews or a link-only state, text search, a sort control, and project, category, and unassigned filters. Let the user select multiple references and copy their stable IDs for a task prompt.
- Reference details show screenshots, the source URL, notes, tags, project and category assignments, capture status, and approved image descriptions. Allow title and metadata edits and adding screenshots after save.
- A reference can belong to zero or more projects and zero or more shared categories. Category assignment is independent of project scope. A reference with zero project assignments is general inspiration.
- Let the user create and rename projects and categories. Archive retired projects while retaining their memberships. Archived projects stay browsable and their references still count as assigned.
- Move removed references to Trash. Hide them from the gallery and assistant lookup. Restore them with the original ID, assets, and assignments, or permanently delete them from Trash after confirmation.
- The Style Guide is deferred beyond the first functional build.

## Use references in Claude Code and Codex

- Provide a reusable search skill, referred to as `/taste` in this spec, backed by a read-only local command. It can search the local PostgreSQL vault and open image files while the web server is stopped. The database must be available for local search.
- Link a repo to a vault project once on the local machine. Search the linked project plus general references by default. A project override changes the active project for that search. References assigned only to other projects stay out of default results, even when they share a category. For an unlinked repo, default to general references and report how to choose a project.
- Search titles, categories, tags, notes, and approved AI descriptions. An image description is optional. The assistant opens explicitly pinned IDs first, then searches for more when the task calls for it. Return an intelligible result for a missing or trashed pin.
- Expose a separate plugin skill in Claude Code and Codex for on-demand image descriptions. Open the selected screenshot, draft a description, and let the user approve it before saving. Approved text becomes searchable. Keep description writes out of the search command.

## Hosted assistant API

Use the same skills and command in local and hosted modes. In hosted mode the command calls a small authenticated JSON REST API over HTTPS and opens images retrieved through the API. Web pages serve the human workflow. Web and API operations share the same vault logic.

| Proposed endpoint | Behavior |
| --- | --- |
| `GET /api/v1/references?q=…&project=…&limit=…&cursor=…` | Search within the requested project plus general references. Return a bounded page with stable IDs, titles, matching context, and screenshot metadata. |
| `GET /api/v1/references/{id}` | Resolve a pinned reference and return its available images, source, and metadata. |
| `GET /api/v1/references/{id}/screenshots/{screenshotId}` | Return the authorized image bytes with their media type. |
| `PUT /api/v1/references/{id}/screenshots/{screenshotId}/description` | Save the description already approved by the user in the description skill. |

Use explicit project IDs and treat an omitted project as general scope. The command resolves repo links on the user's machine. JSON errors should identify missing references, invalid queries, and authentication failures in a form the command can relay. Separate read and description-write permissions. Choose the exact credential mechanism before hosting.

Give the assistant a short search result with each reference's ID, title, relevant excerpt, and image count. Open only the selected images. Start with compact output from the command. If real searches yield long, uniform result lists, compare TOON with compact JSON at the command output before adding a second encoding. The hosted API contract can stay stable either way.

## Storage, backup, and Railway

- Use the same PostgreSQL schema and migrations locally and on Railway. Keep screenshot files in a configurable local directory and use a mounted Railway volume for the hosted app. Store relative storage keys so moving the folder preserves references. [Railway PostgreSQL](https://docs.railway.com/databases/postgresql) · [Railway volumes](https://docs.railway.com/volumes)
- Document how to back up or move the vault as one folder containing a PostgreSQL dump and its matching screenshot files. Pause writes or take a consistent snapshot. A restore preserves IDs, memberships, and screenshot links. Verify the ID sequence resumes above the saved allocation state.
- After local validation, run the same SvelteKit Node build on Railway alongside its private PostgreSQL service. Configure the public origin, database connection, and volume path at runtime. Require authenticated access to the hosted gallery, API, and assets. Verify that existing data and screenshot links survive moving the vault and restarting the service. [Railway SvelteKit guide](https://railway.com/guides/sveltekit)

## Scaffold acceptance

1. A fresh clone can install dependencies, run `npm run check` and `npm run build`, and serve locally with `npm run dev` or `npm run start:local` after building.
2. The gallery, add-reference, reference-detail, projects, categories, and Trash routes render simple placeholders. The reference-detail route accepts a reference ID.
3. TypeScript stubs represent reference metadata, project and category memberships, repo links, screenshots and their provenance, approved descriptions, and capture job states.
4. The app builds with the Node adapter. Database migrations, image storage, capture, search, plugins, and hosted authentication belong to the functional build.

## Functional trial acceptance

1. Save an alarm clock screenshot assigned only to the alarm clock project. It appears in that repo's default search and is absent from an unrelated repo's default search. A general reference appears in both.
2. Save a batch with a screenshot, a URL-only reference, and a screenshot with an attached URL. The URL-only reference is available while capture runs. Successful live and archive captures show the correct provenance. A failed capture leaves a usable link and the same ID after retry or manual upload.
3. Group desktop and mobile screenshots, select that reference and another in the gallery, and paste their IDs into a task. With the web app closed, the skill opens the pinned screenshots and can find additional references with the correct scope.
4. Approve an image description in either supported assistant. Verify that a phrase from it finds the reference and that an unapproved draft has no effect on search.
5. Trash and restore a reference, archive a project, and restore the vault from backup. Verify that trashed references stay out of search, restored references retain their IDs, and archived assignments never become general references by accident.

## Hosted acceptance

1. Restore a local vault backup to Railway PostgreSQL and the mounted screenshot volume. Existing IDs, references, and images still resolve after a service restart.
2. Point the same command and skills at the hosted API. Search, pin lookup, image retrieval, and saving an approved description work without changing the task prompt. Unauthenticated requests are rejected and a read-only credential cannot save a description.
