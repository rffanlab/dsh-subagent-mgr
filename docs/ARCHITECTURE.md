# Architecture

## Goal

Make named DeepSeek Harness subagents manageable without asking humans to maintain repeated YAML plugin rows, while keeping DeepSeek Harness as the execution authority.

## Planes

```text
                     ┌─────────────────────┐
                     │ Web Settings panel  │
                     │ /subagents command  │
                     └──────────┬──────────┘
                                │
                                ▼
                     Harness settingsScope
                         subagent-mgr
                                │
                                ▼
                      validated roster store
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
        capability / route doctor      runtime reconciler
                                              │
                                              ▼
                                   dsh-tool-subagent Fibers
                                              │
                                              ▼
                                      ctx.subagents
```

`dsh-subagent-mgr` is a manager, not a subagent backend.

## State

Harness settings is authoritative once available:

```yaml
subagent-mgr:
  schemaVersion: 1
  migratedLegacy: true
  profiles: ...
```

The settings schema provides structural validation. `validateStore()` owns semantic normalization and invariants such as provider/model atomicity, tool-name uniqueness, depth values and allow/deny overlap.

The v0.1 JSON file is only a migration/fallback source before settings is ever bound.

## Runtime transaction

An enabled profile owns one child Cordis Fiber running the official `dsh-tool-subagent` package.

A roster transition:

1. validates the complete target roster against live provider capabilities;
2. skips workers whose translated config fingerprint is unchanged;
3. mounts replacements and waits for `fiber.await()`;
4. records inverse operations for every applied change;
5. rolls back in reverse order if any later change fails;
6. commits the in-memory roster only after the whole transition succeeds.

A user mutation then persists the accepted roster. If persistence fails, the runtime transaction rolls back. External settings edits use the same transition logic; a failed external transition attempts to restore the prior settings roster.

## Web concurrency

The browser binds the same `subagent-mgr` settings namespace.

Each editor draft records the namespace revision at which it was based. Saving uses revision-fenced `settingsScope.mutate()`. If another window, command, or file edit changes the roster meanwhile, the draft remains visible and the user must explicitly load the external version or rebase the draft.

## Backend capability hints

The Host always uses live `provider.capabilities`.

The browser additionally carries hints for the six official default backend names so unsupported fields can be explained before save. Custom provider names receive no speculative restrictions.

Those hints are guarded by the scheduled upstream contract workflow, which checks the corresponding DeepSeek Harness provider sources.

## Route diagnostics

`/subagents doctor` checks live backend capability for every worker.

For explicit routes on the in-process `spawn` and `fork` providers it also asks the live parent `ctx.llm` registry to resolve the exact provider/model route. It intentionally does not misapply the parent's catalog to DSH SDK child runtimes or native Codex/Claude/ACP backends.

## Browser bundle

The package commits a prebuilt lazy-CJS browser artifact:

```text
window.__ModuleLoader__.load({ id, factory })
```

This keeps install-time behavior independent of DeepSeek Harness's repository-private client build preset.

## Compatibility gates

CI checks:

- parser/config translator tests;
- official backend hint tests;
- lazy-CJS browser handoff;
- settings-tab registration;
- revision-fenced Web write markers;
- syntax of shipped Host/Client entries;
- `npm pack --dry-run` contents.

A scheduled upstream watchdog checks the DeepSeek Harness master branch for the contracts this plugin relies on.
