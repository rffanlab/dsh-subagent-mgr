# Architecture

## Goal

Make named DeepSeek Harness subagents manageable without asking humans to maintain repeated YAML plugin rows.

## Boundary

`dsh-subagent-mgr` is a **manager**, not a subagent backend. It delegates actual child creation to DeepSeek Harness by dynamically mounting `@deepseek-ai/dsh-tool-subagent` instances.

```text
Human
  │
  └─ /subagents add local_worker provider=ollama model=qwen3.8:27b
        │
        ▼
 dsh-subagent-mgr registry
        │
        ├─ validate friendly profile
        ├─ inspect backend capability (when backend is present)
        ├─ persist atomically
        └─ ctx.plugin(@deepseek-ai/dsh-tool-subagent, translatedConfig)
                         │
                         ▼
                DeepSeek Harness native
                subagent service/backends
```

## Lifecycle

Each enabled profile owns one Cordis Fiber.

- **add / enable**: create and mount one fiber;
- **set / route / persona**: dispose old fiber, mount replacement;
- **disable / remove**: dispose the fiber;
- **external state update**: directory watcher reloads and reconciles fingerprints;
- **manager unload**: Cordis recursively disposes child fibers.

## Why dynamic mounting instead of generating YAML

Generating YAML would only move the manual-config problem behind another command and would require loader/HMR semantics for each edit. Dynamic plugin fibers are already the Cordis-native lifecycle primitive: registrations unwind on dispose and replacement is immediate.

## State

State is JSON because it is machine-owned and trivial to migrate. The user-facing API is `/subagents`; JSON is not treated as an authored config contract.

Writes use temp-file + rename so readers never observe a partially written document.

## Compatibility policy

The translation layer only targets documented `dsh-tool-subagent` fields:

- backend provider;
- tool name;
- child `agentOptions` route/effort/token cap;
- model selection setting;
- foreground/background policy;
- persona;
- tool filters;
- max depth.

Backend-specific behavior is not reimplemented. When a registered backend advertises insufficient capability, the manager refuses the incompatible mutation.

## Web UI

A future Web UI should be a thin client over this same registry. The slash command is intentionally kept as the stable fallback because DeepSeek Harness's external browser-bundle contract can evolve independently of the subagent runtime.
