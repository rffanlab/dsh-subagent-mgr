# dsh-subagent-mgr

**Zero-YAML subagent management + Web control panel for DeepSeek Harness.**

DeepSeek Harness already has a strong native subagent subsystem. `dsh-subagent-mgr` removes the annoying part: install one bundle, then manage named worker roles from the Web Settings UI or `/subagents` commands instead of hand-maintaining repeated `dsh-tool-subagent` rows.

The manager does **not** replace DeepSeek Harness subagents. Every enabled worker is translated into the official `@deepseek-ai/dsh-tool-subagent` config and mounted as a Cordis child Fiber, so model routing, child isolation, background execution, depth limits, personas and tool filtering remain owned by Harness.

## Install

Install directly from GitHub into the profile you use:

```bash
dsh plugin --profile default add github:rffanlab/dsh-subagent-mgr
```

For the Web profile:

```bash
dsh plugin --profile web add github:rffanlab/dsh-subagent-mgr
```

The package declares both `dsh.bundle.patch` and `dsh.client`, so `dsh plugin` activates the Host manager and the browser bundle automatically. **No `cordis.yml` editing is required.**

Upgrade:

```bash
dsh plugin --profile default update dsh-subagent-mgr
```

Remove:

```bash
dsh plugin --profile default remove dsh-subagent-mgr
```

## Web management UI

Open:

```text
Settings → Plugins → 子代理
```

The panel supports:

- create / edit / clone / delete workers;
- enable or disable a worker immediately;
- choose the Harness subagent backend (`spawn`, `fork`, `dsh-sdk`, `codex`, `claude-code`, `acp`, or a custom backend name);
- select an LLM provider/model from the live Harness model catalog, while still allowing custom route IDs;
- select reasoning effort when the chosen model advertises it;
- set `maxTokens` and recursion `maxDepth`;
- switch `one-shot` / `continuable` background behavior;
- enable per-call dynamic model selection;
- edit the worker persona / job description;
- configure tool allow/deny lists;
- edit the model-facing tool name.

Saving a worker updates the running Harness composition immediately. No restart is required just to change a route, persona or worker policy.

### State model

v0.2 uses the native Harness settings service as the authoritative state owner:

```text
subagent-mgr:
  profiles: ...
```

The Web panel writes through `settingsScope`, so Harness revision fencing protects against stale concurrent edits. The manager watches the same namespace and reconciles its child Fibers after each committed change.

`~/.dsh/subagent-mgr.json` from v0.1 is treated only as a legacy import/fallback. On the first settings-enabled launch it is migrated once, non-destructively; a migration marker prevents an old backup from resurrecting deleted workers later.

## Quick start

Create a local worker from the Web UI, or use the command fallback:

```text
/subagents add local_worker provider=ollama model=qwen3.8:27b maxDepth=1
```

Give it a fixed role:

```text
/subagents persona local_worker "Handle repetitive implementation, code search and tests. Return architecture decisions to the parent agent."
```

Create a dynamic router:

```text
/subagents add router backend=spawn dynamic=true background=continuable
```

## Commands

The slash-command path remains available in TUI/Web and is intentionally kept as the compatibility fallback:

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
| `dynamic=true` | Per-call model selection | `modelSelectionSettings` |
| `background=one-shot` | Background policy | `backgroundMode` |
| `runInBackground=false` | Forbid background switch | `enableRunInBackground` |
| `persona="..."` | Child role/persona | `persona` |
| `allow=a,b` | Child tool allowlist | `toolFilter.allow` |
| `deny=x,y` | Child tool denylist | `toolFilter.deny` |
| `maxDepth=1` | Recursion limit | `maxDepth` |
| `tool=my_worker` | Model-facing tool name | `toolName` |

`provider` and `model` are atomic: set both, or leave both empty / use `inherit`.

## Capability-aware safety

`/subagents doctor` reads the currently registered Harness subagent backends and checks every managed worker against the backend's advertised capabilities.

It catches problems such as:

- model overrides on a backend with no `agentOptions` capability;
- `continuable` mode on a backend with no continuation support;
- persona/tool filters on backends that do not support them;
- numeric `maxDepth` on a backend that cannot enforce depth.

The Web editor does client-side structural validation; the Host remains authoritative and rejects invalid roster writes through the settings namespace validator.

## Why the client bundle is prebuilt

DeepSeek Harness external browser plugins must use its lazy-CJS handoff:

```text
window.__ModuleLoader__.load({ id, factory })
```

The repository commits `lib/client.js` in that exact shape instead of requiring users to reproduce Harness's internal `tsdown.client.ts` preset. This avoids a build step during `dsh plugin add`, while still resolving React and Harness services through the browser module table.

## Development

```bash
npm test
npm run check
```

Tests cover the profile parser/config translator and the browser handoff/Settings-tab registration contract.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for lifecycle and state details.

## License

MIT
