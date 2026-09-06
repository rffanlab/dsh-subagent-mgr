# Consistency and failure semantics

`dsh-subagent-mgr` treats the Harness settings document and the mounted `dsh-tool-subagent` fibers as two views of one roster.

## Runtime transactions

A roster transition is applied as a transaction. New and changed workers are activated first and each child Fiber is awaited through `fiber.await()`. Only after every replacement is healthy are disabled or deleted workers removed. If any step fails, completed steps are undone in reverse order so the previous mounted roster is restored.

Slash-command writes prove the runtime transition before writing settings (or the legacy file). If persistence fails, the runtime transition is rolled back. Web/settings writes are validated against the currently registered backend capabilities before persistence; if an unexpected activation failure still occurs after an external settings commit, the manager restores the previous settings roster.

## Web concurrency

The Web editor records the settings namespace revision at the start of an edit and writes through `settingsScope.mutate(..., expectedRevision)`. Unrelated roster updates can be rebased onto the draft. If the worker being edited changed elsewhere, the draft is preserved and the UI enters an explicit conflict state instead of replacing the form or silently overwriting the external edit.

The user can then load the external version or rebase their draft onto the latest revision before saving.

## Legacy JSON

`subagent-mgr.json` exists only as an import/fallback for Harness deployments that never provide `ctx.settings`. Once the settings service has been observed, settings remains authoritative for that process. A temporary settings/HMR gap will not fall back to an old JSON file and resurrect deleted workers.

## Why this matters

The manager is a control plane. A control-plane write should either become the complete new roster or leave the old roster intact. Partial activation, silent last-writer-wins edits, and stale fallback resurrection are treated as correctness bugs rather than acceptable eventual consistency.
