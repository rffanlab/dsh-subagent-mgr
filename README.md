# dsh-subagent-mgr

**Zero-YAML subagent control plane + Web management UI for DeepSeek Harness.**

`dsh-subagent-mgr` keeps DeepSeek Harness's native subagent implementation, but removes the need to hand-maintain repeated `dsh-tool-subagent` rows. Install the bundle once, then manage named worker roles from Web Settings or `/subagents`.

Every enabled worker is translated into the official `@deepseek-ai/dsh-tool-subagent` config and mounted as a Cordis child Fiber. Harness remains authoritative for child isolation, model routing, background execution, depth limits, personas, tool filtering, and provider capability checks.

## Install

```bash
dsh plugin --profile default add github:rffanlab/dsh-subagent-mgr
```

For the Web profile:

```bash
dsh plugin --profile web add github:rffanlab/dsh-subagent-mgr
```

Upgrade:

```bash
dsh plugin --profile default update dsh-subagent-mgr
```

The package declares both `dsh.bundle.patch` and `dsh.client`; no `cordis.yml` editing is required.

## Web UI

Open:

```text
Settings → Plugins → 子代理
```

The panel supports:

- create, edit, clone, delete, enable and disable workers;
- `spawn`, `fork`, `dsh-sdk`, `codex`, `claude-code`, `acp`, or custom backend names;
- live provider/model/reasoning suggestions from Harness `session/modelCatalog`;
- custom provider/model IDs for local or dynamic routes;
- `maxTokens`, `maxDepth`, `one-shot` / `continuable`, and `run_in_background`;
- per-call dynamic model selection;
- Persona / job description;
- tool allow/deny filters;
- model-facing tool name;
- search by worker, backend, model, tool or persona;
- revision-aware conflict protection when another window or `/subagents` changes the same roster.

### v0.4 capability-aware editing

For the six official backend default names, the UI shows the capability contract currently shipped by DeepSeek Harness.

Examples:

- `spawn` / `fork`: model overrides, Persona, tool filters, numeric depth and continuable children are supported;
- `dsh-sdk`: model overrides are supported, while Persona/tool filters/numeric depth/continuable are child-runtime owned or unsupported;
- `codex`, `claude-code`, `acp`: the backend owns its own child environment and does not accept `dsh-tool-subagent` `agentOptions`, Persona, tool filters or numeric depth.

The editor never guesses capabilities for a custom backend. Custom providers stay fully editable and the Host's live provider capability check remains authoritative.

If an existing profile contains options incompatible with a known official backend, the UI keeps the values visible and offers **清理不兼容选项** instead of silently deleting them.

## State

The authoritative roster lives in Harness settings:

```yaml
subagent-mgr:
  schemaVersion: 1
  profiles: ...
  migratedLegacy: true
```

The nested profile schema is now structurally validated before the existing semantic validator runs.

v0.1's `$DSH_HOME/subagent-mgr.json` remains a one-time non-destructive migration/fallback source. Once Harness settings has been bound, the manager never forks state back into the legacy file.

## Runtime consistency

Roster transitions are transactional:

1. validate the complete target roster;
2. mount replacement `dsh-tool-subagent` Fibers and `await fiber.await()`;
3. roll back already-applied Fiber changes if any replacement fails;
4. persist settings only after the runtime transition is viable;
5. roll the runtime back if persistence fails.

The Web editor also carries the settings revision at which editing began. A concurrent mutation keeps the user's draft intact and requires an explicit conflict decision rather than silently overwriting either side.

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
/subagents health
/subagents reload
/subagents help
```

### Doctor / health

`/subagents doctor` now checks two layers:

1. the live subagent backend's advertised capabilities;
2. for in-process `spawn`/`fork` workers with an explicit LLM route, the parent Harness's actual provider/model route using `ctx.llm.resolveModelInfo()`.

DSH SDK routes are deliberately reported as child-runtime-owned, while Codex/Claude/ACP model selection is reported as backend-owned rather than incorrectly checked against the parent model catalog.

## Options

| User option | Native Harness mapping |
|---|---|
| `backend=spawn` | `dsh-tool-subagent.provider` |
| `provider=ollama` | `agentOptions.provider` |
| `model=qwen...` | `agentOptions.model` |
| `effort=high` | `agentOptions.reasoningEffort` |
| `maxTokens=8192` | `agentOptions.maxTokens` |
| `dynamic=true` | `modelSelectionSettings` |
| `background=one-shot` | `backgroundMode` |
| `runInBackground=false` | `enableRunInBackground` |
| `persona="..."` | `persona` |
| `allow=a,b` | `toolFilter.allow` |
| `deny=x,y` | `toolFilter.deny` |
| `maxDepth=1` | `maxDepth` |
| `tool=my_worker` | `toolName` |

`provider` and `model` are atomic: set both or inherit both.

## Compatibility watchdog

DeepSeek Harness is moving quickly, so this repository includes a scheduled upstream contract check. It watches:

- `dsh-tool-subagent` configuration fields;
- settings revision/mutation API;
- lazy-CJS `__ModuleLoader__.load` client contract;
- `dsh.bundle` profile activation;
- the official capability shape of `spawn`, `fork`, `dsh-sdk`, `codex`, `claude-code`, and `acp`.

If upstream changes one of the assumptions used by the manager or its Web hints, the scheduled GitHub Action fails instead of letting the UI drift silently.

## Development

```bash
npm test
npm run check
npm run packcheck
npm run upstreamcheck
```

The shipped browser bundle is prebuilt in Harness lazy-CJS format, so installing the plugin does not require reproducing DeepSeek Harness's internal client build preset.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for lifecycle details.

## License

MIT
