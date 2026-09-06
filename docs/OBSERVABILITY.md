# Runtime observability

`dsh-subagent-mgr` v0.5 adds an **observer**, not a second execution authority. The manager still owns configuration and managed `dsh-tool-subagent` Fibers; telemetry listens around the native Harness tool-dispatch waterfall and records only calls whose tool name belongs to a managed worker.

## Attribution

Each managed profile has a unique `toolName`. Harness exposes `tools/execute` as an around-dispatch waterfall whose `next()` resolves to the final normalized `ToolExecutionResult`. The telemetry wrapper uses that boundary because it gives an exact one-call-to-one-worker attribution without guessing from backend-level `subagent/start` events.

Ordinary tools such as `read_file` are ignored.

## What is recorded

Per worker, the persistent aggregate contains:

- total calls;
- successes and failures;
- foreground and background call counts;
- total / average / maximum / latest dispatch duration;
- most recent start and completion timestamps;
- most recent configured or per-call model route;
- most recent success/error state;
- a short error **code/type only** when available.

The recent-call ring is bounded to 100 rows. It stores worker id, tool name, timestamps, duration, foreground/background mode, route, outcome, and optional error code.

The telemetry file deliberately does **not** persist prompts, task descriptions, assistant output, full error messages, environment values, credentials, or file contents.

## Foreground versus background semantics

A foreground `dsh-tool-subagent` call normally settles after the delegated child turn settles. Its duration and final `isError` therefore describe the delegated call as observed by the parent tool invocation.

A background call is different: the model-facing tool returns after the background job has been accepted/scheduled. For that reason:

- `background` success means **accepted/scheduled**, not "the child eventually succeeded";
- background duration measures the scheduling/acceptance path, not the later child runtime;
- the Web UI labels this distinction explicitly.

The manager does not collapse these two meanings into one fake metric.

## Token usage

v0.5 intentionally does **not** report token totals. In-process children can expose usage through their own Session history, but the generic managed-tool invocation does not currently have a stable cross-backend correlation to child usage for every supported backend (`spawn`, `fork`, DSH SDK, Codex, Claude Code, ACP).

Token counters will be added only when a stable Harness contract can attribute them without guessing. Missing data is preferable to false precision.

## Storage

Default path:

```text
$DSH_HOME/subagent-mgr-telemetry.json
```

or, when `DSH_HOME` is unset:

```text
~/.dsh/subagent-mgr-telemetry.json
```

Optional override:

```text
DSH_SUBAGENT_MGR_TELEMETRY=/path/to/telemetry.json
```

Writes are:

- debounced for 750 ms so one burst does not rewrite the file for every call;
- serialized;
- written to a temporary file and atomically renamed;
- created with mode `0600` where the platform honors POSIX modes.

An unclean process crash can lose only the most recent unflushed debounce window; telemetry is never allowed to become more important than the agent runtime it observes.

## Commands

```text
/subagent-stats
/subagent-stats recent
/subagent-stats json
/subagent-stats reset <worker|all>
```

The command has `recordInput: false`; callers can request a machine-readable JSON snapshot without the statistics command itself becoming a managed worker call.

## Web UI

The Web panel reads telemetry **only when the user presses Refresh**. It does not poll and it does not write telemetry into Harness settings.

To avoid inventing another RPC, it reuses Harness's existing command Remote with the current `uiSession` session id and executes:

```text
/subagent-stats json
```

Harness therefore records the normal command lifecycle for that explicit refresh. This is intentional and is shown in the UI copy.

## No automatic retry

A low success rate can trigger a recommendation to use a stronger model or narrow the worker's task scope. v0.5 does **not** automatically re-run a failed task with another model.

Coding/agent tasks may have side effects before they fail. Blind retry can duplicate edits, commands, uploads, or other actions. Automatic escalation requires an idempotency/transaction contract and is a separate future feature, not a telemetry shortcut.
