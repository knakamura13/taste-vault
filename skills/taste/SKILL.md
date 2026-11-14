---
name: taste
description: Find and open Taste Vault design references for the current repository.
---

Resolve explicitly pinned REF IDs first using `node /PATH/TO/taste-vault/scripts/taste.js pin REF-000001`. Open the returned image paths with the assistant's image viewer. Then, when useful, search using `node /PATH/TO/taste-vault/scripts/taste.js search <terms>` and open only relevant images. Search defaults to the linked project plus general references; an unlinked repository searches general references. Use `--project <project-id>` for an override. Report missing pins. This command requires the local database but not the web server.
