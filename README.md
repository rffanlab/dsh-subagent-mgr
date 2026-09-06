# dsh-subagent-mgr

**Zero-YAML subagent control plane + Web management UI + runtime observability for DeepSeek Harness.**

`dsh-subagent-mgr` keeps DeepSeek Harness's native subagent implementation, but removes the need to hand-maintain repeated `dsh-tool-subagent` rows. Install the bundle once, then manage named worker roles from Web Settings or `/subagents`.

Every enabled worker is translated into the official `@deepseek-ai/dsh-tool-subagent` config and mounted as a Cordis child Fiber. Harness remains authoritative for child isolation, model routing, background execution, depth limits, personas, tool filtering, and provider capability checks. v0.5 adds a separate telemetry observer around managed tool execution; telemetry never becomes configuration or execution authority.

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
- revision-aware conflict protection when another window or `/subagents` changes the same roster;
- **manual runtime-statistics refresh** for the selected worker.

### Capability-aware editing

For the six official backend default names, the UI shows the capability contract currently shipped by DeepSeek Harness.

Examples:

- `spawn` / `fork`: model overrides, Persona, tool filters, numeric depth and continuable children are supported;
- `dsh-sdk`: model overrides are supported, while Persona/tool filters/numeric depth/continuable are child-runtime owned or unsupported;
- `codex`, `claude-code`, `acp`: the backend owns its own child environment and does not accept `dsh-tool-subagent` `agentOptions`, Persona, tool filters or numeric depth.

The editor never guesses capabilities for a custom backend. Custom providers stay fully editable and the Host's live provider capability check remains authoritative.

If an existing profile contains options incompatible with a known official backend, the UI keeps the values visible and offers **清理不兼容选项** instead of silently deleting them.

## Runtime observability — v0.5

v0.5 records managed-worker execution at the Harness `tools/execute` boundary, keyed by each worker's unique `toolName`.

For each worker it can show:

- total calls;
- currently running calls;
- successes / failures and success rate;
- foreground / background counts;
- average, maximum and latest dispatch duration;
- latest route, outcome and short error code;
- recent managed calls.

The Web panel does **not poll**. Press **刷新统计** when you want a new snapshot. It reuses Harness's existing command Remote and the current `uiSession` to execute `/subagent-stats json`; no second telemetry RPC and no high-frequency settings writes are introduced.

### Important telemetry semantics

Foreground calls normally settle with the child result, so their final `isError` and duration describe the delegated tool call seen by the parent.

Background calls are different: the tool returns after the job is accepted/scheduled. Therefore **background success means accepted/scheduled, not that the later child execution eventually succeeded**, and background duration measures that acceptance path. The UI labels this explicitly.

Token totals are intentionally absent in v0.5. There is not yet one stable cross-backend managed-tool → child-usage attribution contract covering in-process children plus DSH SDK, Codex, Claude Code and ACP. The plugin prefers missing data over fake precision.

A low accumulated success rate may produce a recommendation to use a stronger model or narrow the worker's task scope. The plugin does **not** automatically retry failed tasks: coding/agent work may already have produced side effects before failure.

See [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) for the exact metric, persistence, privacy and safety semantics.

## Telemetry storage

Telemetry is separate from Harness settings. Default path:

```text
$DSH_HOME/subagent-mgr-telemetry.json
```

or:

```text
~/.dsh/subagent-mgr-telemetry.json
```

Override it with:

```text
DSH_SUBAGENT_MGR_TELEMETRY=/path/to/subagent-telemetry.json
```

Writes are serialized, debounced for 750 ms, written through temp-file + atomic rename, and the recent-call ring is capped at 100 rows. Prompts, task descriptions, assistant output, full error text, credentials and file contents are not persisted by telemetry.

## State

The authoritative **configuration roster** lives in Harness settings:

```yaml
subagent-mgr:
  schemaVersion: 1
  profiles: ...
  migratedLegacy: true
```

The nested profile schema is structurally validated before the existing semantic validator runs.

v0.1's `$DSH_HOME/subagent-mgr.json` remains a one-time non-destructive migration/fallback source. Once Harness settings has been bound, the manager never forks state back into the legacy file.

Telemetry does not use this namespace and cannot create settings revision churn.

## Runtime consistency

Roster transitions are transactional:

1. validate the complete target roster;
2. mount replacement `dsh-tool-subagent` Fibers and `await fiber.await()`;
3. roll back already-applied Fiber changes if any replacement fails;
4. persist settings only after the runtime transition is viable;
5. roll the runtime back if persistence fails.

The Web editor also carries the settings revision at which editing began. A concurrent mutation keeps the user's draft intact and requires an explicit conflict decision rather than silently overwriting either side.

Telemetry is deliberately outside this transaction boundary. If telemetry setup fails, the control plane continues without observability rather than making metrics a dependency of subagent execution.

## Commands

Control plane:

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

Telemetry:

```text
/subagent-stats
/subagent-stats recent
/subagent-stats json
/subagent-stats reset <worker|all>
```

### Doctor / health

`/subagents doctor` checks two layers:

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
- the official capability shape of `spawn`, `fork`, `dsh-sdk`, `codex`, `claude-code`, and `acp`;
- the `tools/execute` around-dispatch metrics boundary;
- the existing command Remote used by Web statistics refresh;
- the `uiSession` current-session identity used to address that command.

If upstream changes one of the assumptions used by the manager, telemetry collector, or Web panel, the scheduled GitHub Action fails instead of letting behavior drift silently.

## Development

```bash
npm test
npm run check
npm run packcheck
npm run upstreamcheck
```

The shipped browser bundle is prebuilt in Harness lazy-CJS format, so installing the plugin does not require reproducing DeepSeek Harness's internal client build preset.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/CONSISTENCY.md](docs/CONSISTENCY.md), and [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md).

## License

MIT
