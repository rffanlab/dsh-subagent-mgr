# Architecture

## Goal

Make DeepSeek Harness subagents feel like managed workers rather than YAML rows.

## Runtime boundary

`dsh-subagent-mgr` is a manager, not a child-agent backend. The official Harness subagent service and providers remain the execution authority.

```text
                         ┌────────────────────────────┐
 Web Settings            │  Harness settings service │
 Plugins → 子代理 ──────►│  subagent-mgr namespace  │
                         └──────────────┬─────────────┘
                                        │ committed change
 /subagents command ────────────────────┤
                                        ▼
                            dsh-subagent-mgr roster
                                        │
                         validate + reconcile Fibers
                                        │
                   ┌────────────────────┼────────────────────┐
                   ▼                    ▼                    ▼
             sub_local_worker      sub_reviewer         sub_router
              tool-subagent         tool-subagent        tool-subagent
                   │                    │                    │
                   └──────────── Harness ctx.subagents ─────┘
```

## Host plane

The Host plugin owns four responsibilities:

1. register the `subagent-mgr` settings namespace;
2. validate every roster write with the same `validateStore()` rules used by slash commands;
3. translate each enabled profile to official `dsh-tool-subagent` configuration;
4. reconcile dynamic Cordis child Fibers.

Each enabled profile owns exactly one child Fiber.

- add / enable → mount one Fiber;
- route / persona / policy edit → dispose the old Fiber and mount a replacement;
- disable / delete → dispose the Fiber;
- manager unload → Cordis recursively disposes managed Fibers.

The manager never reimplements child startup, continuation, depth enforcement, or model routing.

## Settings state

The authoritative v0.2 state is the Harness settings namespace:

```text
subagent-mgr:
  migratedLegacy: true
  profiles:
    local_worker:
      ...
```

Why settings instead of another custom RPC/database:

- Web clients already have a supported revision-fenced `settingsScope` write path;
- `$DSH_HOME/settings.yaml` already has file watching and cross-surface invalidation;
- stale writes are rejected by namespace revision instead of silently winning;
- the plugin needs no extra Remote service or Typert-generated artifacts.

The Host registers a broad serializable schema for the profile dictionary and uses `validateStore()` as the semantic validator. That keeps CLI, Web and externally edited settings on one rule set.

## Legacy state

v0.1 used `$DSH_HOME/subagent-mgr.json` with atomic temp-file + rename writes.

v0.2 keeps that path only for compatibility:

- if Harness has no settings service, it remains the fallback state owner;
- when settings first becomes available and its roster is empty, the old roster is copied into settings;
- `migratedLegacy: true` records that the import decision has happened;
- the legacy file is not deleted automatically;
- after migration, later deletion of every worker stays deleted and is not resurrected from the backup.

## Browser plane

The package also declares `dsh.client` and exports a prebuilt `lib/client.js`.

DeepSeek Harness expects external client bundles to register a lazy CommonJS factory:

```text
window.__ModuleLoader__.load({ id: 'dsh-subagent-mgr', factory(require) { ... } })
```

The factory resolves `react` and `react/jsx-runtime` through Harness's browser module table, then registers one `settings.plugins.tab` contribution. The component binds `ctx.settingsScope` to the `subagent-mgr` namespace and loads `ctx.remote.session.modelCatalog()` for provider/model suggestions.

The UI does not need a custom Host RPC.

## Model catalog

The editor reads Harness's existing Host-generation model catalog. This gives provider/model/reasoning suggestions without making the manager own a second model directory.

Text inputs still allow custom IDs because a valid provider route may intentionally not advertise a model list.

## Compatibility policy

The translation layer targets documented `dsh-tool-subagent` fields only:

- backend provider;
- tool name;
- child `agentOptions` provider/model/effort/token cap;
- model selection setting;
- foreground/background policy;
- persona;
- tool filters;
- max depth.

`/subagents doctor` remains the backend-capability diagnostic. Unsupported provider features fail loudly rather than being silently dropped.
