# dsh-subagent-mgr

**Zero-YAML subagent management for DeepSeek Harness.**

DeepSeek Harness already has a capable native subagent subsystem. The annoying part is that named worker roles normally end up as repeated `dsh-tool-subagent` rows in composition files. `dsh-subagent-mgr` removes that manual layer: install the bundle once, then add, edit, route, disable, clone, or remove workers with the `/subagents` command.

The manager does **not** replace DeepSeek Harness subagents. It dynamically mounts the official `@deepseek-ai/dsh-tool-subagent` plugin for every enabled profile, so provider capability checks, child isolation, background behavior, model routing, max-depth enforcement, personas, and tool filters stay owned by Harness itself.

## Install

Install directly from GitHub into the DSH profile you actually use:

```bash
dsh plugin --profile default add github:rffanlab/dsh-subagent-mgr
```

Use another profile name if needed:

```bash
dsh plugin --profile web add github:rffanlab/dsh-subagent-mgr
```

Because this repository declares a `dsh.bundle.patch`, `dsh plugin` activates it as a profile layer automatically. **No `cordis.yml` editing is required.**

Remove it with:

```bash
dsh plugin --profile default remove dsh-subagent-mgr
```

## Quick start

Inside DSH:

```text
/subagents add worker
/subagents add local_worker provider=ollama model=qwen3.8:27b maxDepth=1
/subagents add router backend=spawn dynamic=true background=continuable
/subagents list
/subagents doctor
```

Each managed profile becomes its own model-facing tool. By default the tool is named `sub_<id>` so it does not collide with Harness's stock `subagent` tool.

Example:

```text
/subagents add local_worker provider=ollama model=qwen3.8:27b persona="Handle repetitive implementation and tests. Escalate architecture decisions."
```

creates a tool named:

```text
sub_local_worker
```

and routes its children through:

```text
backend: spawn
LLM provider: ollama
model: qwen3.8:27b
```

## Commands

```text
/subagents list
/subagents add <id> [key=value ...]
/subagents set <id> key=value ...
/subagents route <id> <provider|inherit> <model|inherit> [effort|inherit]
/subagents persona <id> <text|inherit>
/subagents enable <id>
/subagents disable <id>
/subagents clone <source> <target>
/subagents rm <id>
/subagents show <id>
/subagents doctor
/subagents reload
/subagents help
```

### Options

| User option | Meaning | Native Harness mapping |
|---|---|---|
| `backend=spawn` | Subagent backend | `provider` on `dsh-tool-subagent` |
| `provider=ollama` | Child LLM provider | `agentOptions.provider` |
| `model=qwen...` | Child model | `agentOptions.model` |
| `effort=high` | Reasoning effort | `agentOptions.reasoningEffort` |
| `maxTokens=8192` | Child output limit | `agentOptions.maxTokens` |
| `dynamic=true` | Allow per-call model selection | `modelSelectionSettings` |
| `background=one-shot` | Child background policy | `backgroundMode` |
| `runInBackground=false` | Hide/forbid background switch | `enableRunInBackground` |
| `persona="..."` | Child role/persona | `persona` |
| `allow=a,b` | Child tool allowlist | `toolFilter.allow` |
| `deny=x,y` | Child tool denylist | `toolFilter.deny` |
| `maxDepth=1` | Recursion limit | `maxDepth` |
| `tool=my_worker` | Model-facing tool name | `toolName` |

`provider` and `model` are intentionally atomic: set both, or set both to `inherit`.

## Capability-aware safety

`/subagents doctor` reads the currently registered Harness subagent backends and checks each managed worker against its advertised capabilities.

Examples of errors caught before you depend on a broken worker:

- model overrides on a backend with no `agentOptions` capability;
- `continuable` mode on a backend with no continuation support;
- persona/tool filters on backends that do not expose those capabilities;
- numeric `maxDepth` on a backend that cannot enforce depth.

Missing backends are warnings rather than destructive errors, so you can define a worker before an optional provider bundle is installed.

## State and hot reload

The manager persists its own machine-generated state at:

```text
$DSH_HOME/subagent-mgr.json
```

or, when `DSH_HOME` is not set:

```text
~/.dsh/subagent-mgr.json
```

This file is an implementation detail, not a user configuration surface. Writes are atomic, and the manager watches it so multiple running DSH processes converge when one changes the worker roster.

Override the location only when you deliberately want isolated state:

```bash
DSH_SUBAGENT_MGR_STATE=/some/path/subagents.json dsh ...
```

## Design

The manager keeps a tiny registry of named profiles. For every enabled entry it translates the friendly profile into the official `dsh-tool-subagent` config and mounts that plugin dynamically through Cordis. Updating a worker disposes the old child plugin fiber and mounts a replacement; disabling/removing a worker disposes it immediately.

That gives three useful properties:

1. **No duplicated subagent implementation.** DeepSeek Harness remains the runtime authority.
2. **Changes apply live.** You do not have to restart just to change a worker route or persona.
3. **Upstream failures stay loud.** Unsupported backend features are not silently ignored.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the detailed lifecycle.

## Current scope

v0.1 deliberately focuses on the management layer that removes YAML. It does not invent a second scheduler, child runtime, or model catalog. Parallel tool calls and child execution remain native Harness behavior.

A browser settings panel can be added later on top of the same registry without changing the storage or runtime model. The slash-command path remains the compatibility baseline even if Harness changes its Web client plugin bundling.

## Development

```bash
npm test
npm run check
```

The core parser/config translator has no Harness dependency and is covered by Node's built-in test runner.

## License

MIT
