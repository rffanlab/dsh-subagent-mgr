# Advisory routing — v0.6

`dsh-subagent-mgr` v0.6 adds a **read-only decision layer** in front of managed subagents. It ranks workers before delegation; it never dispatches, retries, replays, or mutates the task itself.

## Why advisory instead of auto-retry

Agent work can have side effects before a failure is reported: files may have been edited, commands may have run, or remote systems may have changed. A routing layer that automatically retries on a different worker could duplicate those side effects.

The safe v0.6 contract is therefore:

1. observe historical worker outcomes from v0.5 telemetry;
2. rank currently eligible workers;
3. explain the ranking;
4. return the exact model-facing `toolName`;
5. let the parent Agent decide whether to call that tool.

No candidate is invoked by the router.

## Model-facing tool

Harness exposes:

```text
route_subagent
```

Parameters:

- `task`: short task summary used for lexical fit against existing worker metadata/persona;
- `tags`: optional comma-separated hints, for example `coding,review` or `research,docs`;
- `goal`: `balanced`, `quality`, `speed`, or `cheap`;
- `background`: require a worker that permits `run_in_background`;
- `limit`: return 1–10 candidates.

Example intent:

```text
route_subagent(task="implement tests and refactor duplicated code", tags="coding,tests", goal="cheap")
```

The result names candidates such as:

```text
1. local_worker tool=sub_local_worker score=84.2
2. reviewer tool=sub_reviewer score=77.5
```

The parent Agent must still call `sub_local_worker` or another selected tool itself.

### Privacy note

The router does not persist `task` or `tags` into its telemetry store. However, a normal model-facing Harness tool call may appear in the Session's ordinary `tool/call` log according to Harness session semantics. Do not put secrets into routing summaries.

## Human command

For inspection without asking the model:

```text
/subagent-route
/subagent-route goal=cheap tags=coding,tests task="implement repetitive tests"
/subagent-route goal=quality tags=review,architecture limit=5
/subagent-route goal=speed background=true
```

The command uses `recordInput: false`, so `dsh-subagent-mgr` does not duplicate the routing request into command lifecycle text.

## Evidence used by the scorer

The scorer intentionally uses only signals it can explain.

### Reliability

Historical success is Bayesian-smoothed instead of using raw success rate:

```text
posterior = (successes + 0.72 * 5) / (calls + 5)
```

This gives a new worker a 72% neutral prior backed by five virtual observations. One lucky call therefore cannot immediately outrank an established worker, and a zero-history worker is not treated as 0% reliable.

If at least three recent calls are available, the long-run posterior is blended with a small recent-performance component so a newly degraded worker can move down before its lifetime average changes substantially.

Confidence labels:

- `cold`: 0 calls;
- `low`: 1–5 calls;
- `medium`: 6–19 calls;
- `high`: 20+ calls.

### Speed

Measured average managed-tool dispatch duration is transformed into a bounded speed score:

```text
speed = 1 / (1 + avgDurationMs / 30000)
```

Unmeasured workers receive a neutral 0.5 speed score.

Remember the v0.5 telemetry rule: background duration measures scheduling/acceptance only, not eventual child completion.

### Current load

Live `running` count adds a small load penalty so otherwise-equivalent work can move toward an idle worker:

```text
load = 1 / (1 + running * 0.7)
```

This is process-local and resets after restart, just like the v0.5 live running counter.

### Task fit

Task fit is lexical and deliberately simple. The scorer compares the request's task/tags against already-existing worker signals:

- profile id;
- tool name;
- backend;
- configured provider/model;
- Persona;
- tool allowlist.

It supports ordinary words and additional CJK character/bigram terms for Chinese text. It is **not** an embedding model and must not be presented as semantic understanding.

This design avoids adding a new mandatory routing configuration file. Existing Persona text doubles as a human-readable job description and a routing hint.

### Cost prior

v0.6 does not claim to know actual provider billing.

It uses only an explicit heuristic called `cost-prior`:

- routes visibly containing `ollama`, `vllm`, `lmstudio`, `sglang`, `local`, `localhost`, or `127.0.0.1` receive a strong local-cost prior;
- inherited and backend-owned routes remain uncertain;
- explicit non-local routes receive a conservative lower cheapness prior.

The output labels this as a prior, never as dollars or actual spend.

## Goal weights

The same explainable components are reweighted by intent.

| Goal | Reliability | Speed | Cost prior | Task fit | Load |
|---|---:|---:|---:|---:|---:|
| `balanced` | 45% | 18% | 12% | 20% | 5% |
| `quality` | 60% | 8% | 4% | 23% | 5% |
| `speed` | 25% | 40% | 8% | 12% | 15% |
| `cheap` | 25% | 8% | 45% | 17% | 5% |

The score is advisory, not a policy gate. The parent Agent may choose a lower-ranked worker when it has context the scorer does not.

## Eligibility

A worker is excluded when:

- the profile is disabled;
- it lacks a model-facing `toolName`;
- the routing request requires background execution and the profile has `enableRunInBackground=false`.

Backend capability validation remains owned by the v0.4/v0.5 manager and Harness itself.

## Failure isolation

The routing layer is deliberately outside the control-plane transaction boundary.

`src/plugin.js` mounts:

1. telemetry;
2. advisory routing;
3. the authoritative manager.

Telemetry or routing setup failure is logged and degraded independently. Neither can prevent the manager from owning settings, Fiber transitions, rollback, or child execution.

## No automatic fallback yet

v0.6 does **not** implement:

- failure-triggered automatic retries;
- automatic escalation to a stronger model;
- replay of an already-started task;
- hidden task dispatch from `route_subagent`.

A future automatic fallback layer should first have an explicit side-effect/idempotency contract. Until then, recommendations are safer than invisible retries.
