# Changelog

## 0.6.0 - 2026-09-07

- Added a read-only model-facing `route_subagent` tool that ranks managed workers before delegation and never dispatches, retries, or replays work itself.
- Added `/subagent-route` for human routing inspection using the same scorer with `recordInput: false`.
- Added routing objectives `balanced`, `quality`, `speed`, and `cheap` with explicit, documented component weights.
- Added Bayesian-smoothed reliability so cold workers remain eligible without one lucky run dominating established evidence.
- Blend a bounded recent-performance signal into long-run reliability when enough recent calls exist.
- Added measured latency and current in-process `running` load as routing evidence.
- Added lexical task fit against existing worker Persona/profile metadata, including CJK character/bigram matching for Chinese text, without introducing a new routing config file.
- Added an explicitly labeled local/non-local **cost prior** instead of pretending to know provider billing; known Ollama/vLLM/LM Studio/SGLang/local routes are favored under `goal=cheap`.
- Correctly treat Codex/Claude/ACP/DSH-SDK backend-owned routes separately from ordinary parent-model inheritance.
- Exclude disabled workers and workers that disallow background execution when `background=true` is requested.
- Split the pure scoring engine (`routing-score.js`) from the Harness adapter (`router.js`) for deterministic testing and easier upstream compatibility maintenance.
- Keep routing failure isolated from telemetry and the authoritative manager; routing advice cannot block settings, Fiber transitions, rollback, or child execution.
- Added `@deepseek-ai/dsh-tools` as the public model-facing tool-authoring peer and extended the upstream watchdog to verify that seam.
- Added routing regression tests for cheap/quality/research decisions, background eligibility, load balancing, Bayesian cold starts, backend-owned cost priors, invalid inputs, and no-side-effect output semantics.
- Added `docs/ROUTING.md` documenting formulas, privacy, cost-prior limits, confidence levels, eligibility, and the no-auto-retry boundary.

## 0.5.0 - 2026-09-06

- Added a separate persistent runtime telemetry observer for managed subagent tool calls.
- Attribute calls by each managed worker's unique `toolName` at Harness's `tools/execute` around-dispatch boundary.
- Track calls, in-memory running count, success/failure totals, foreground/background totals, average/max/latest duration, latest route/outcome/error code, and a bounded recent-call ring.
- Persist telemetry outside Harness settings at `$DSH_HOME/subagent-mgr-telemetry.json` (or `DSH_SUBAGENT_MGR_TELEMETRY`) with 750 ms batched atomic writes.
- Keep telemetry privacy-minimal: no prompts, task descriptions, assistant outputs, full error messages, environment values, credentials, or file contents are persisted.
- Added `/subagent-stats`, `recent`, `json`, and `reset <worker|all>` command surfaces.
- Added a manual Web runtime-statistics panel using the existing Harness command Remote and current `uiSession`; no polling and no custom telemetry RPC.
- Explicitly distinguish foreground completion metrics from background acceptance/scheduling metrics.
- Deliberately omit token totals until Harness exposes stable managed-tool-to-child-usage attribution across all supported backends.
- Added low-success-rate recommendations without automatic retries, avoiding unsafe duplication of partially completed side-effecting tasks.
- Made telemetry a non-authoritative root wrapper: telemetry setup failure degrades observability only and does not block the existing control plane.
- Extended the weekly upstream watchdog to cover `tools/execute`, command Remote, and current `uiSession` contracts used by observability.
- Added persistent telemetry lifecycle, Web telemetry transport, root-wrapper isolation, and v0.4-regression tests.
- Added `docs/OBSERVABILITY.md` defining metric semantics, storage, privacy, and no-auto-retry policy.

## 0.4.0 - 2026-09-06

- Added a versioned, structurally typed Harness settings schema for managed profiles.
- Added official backend capability hints for `spawn`, `fork`, `dsh-sdk`, `codex`, `claude-code`, and `acp`.
- Added capability badges and proactive incompatibility warnings to the Web editor, with an explicit cleanup action instead of silent field deletion.
- Kept custom backends unrestricted in the browser; live Host capabilities remain authoritative.
- Added route-health feedback using the live Harness model catalog.
- Extended `/subagents doctor` / `/subagents health` to preflight explicit `spawn`/`fork` LLM routes with `ctx.llm.resolveModelInfo()`.
- Route diagnostics correctly treat DSH SDK routes as child-runtime-owned and Codex/Claude/ACP routes as backend-owned.
- Parallelized route diagnostics across workers.
- Added `schemaVersion` to the settings namespace for future migrations.
- Extended the weekly upstream watchdog to verify the capability assumptions behind all six official backend hints.
- Added v0.4 browser, manifest, and capability-hint regression tests.

## 0.3.0 - 2026-09-06

- Made runtime roster changes transactional with reverse-order rollback for multi-worker edits.
- Await `fiber.await()` for every dynamically mounted `dsh-tool-subagent`, so startup failures are detected instead of treating a returned Fiber as healthy.
- Validate Web/settings writes against the capabilities advertised by the currently registered subagent backends.
- Restore the previous settings roster when an externally persisted edit unexpectedly fails runtime activation.
- Prevent stale legacy JSON from becoming authoritative again after Harness settings has been observed.
- Added revision-aware Web editing: unsaved drafts survive external changes and enter an explicit conflict state instead of being overwritten.
- Added reload/keep-draft conflict actions, unsaved-change navigation guards, search, route inheritance shortcut, and clearer enabled/route status in the Web panel.
- Added host consistency contract tests and Web concurrency contract tests.
- Added `npm pack --dry-run` to CI so published/installable file coverage is checked on Node 20 and Node 22.
- Added `docs/CONSISTENCY.md` documenting transaction, rollback, concurrency, and legacy fallback semantics.

## 0.2.0 - 2026-09-06

- Added a native DeepSeek Harness Web management panel under `Settings → Plugins → 子代理`.
- Added create/edit/clone/delete/enable/disable worker controls.
- Added live provider/model/reasoning suggestions from `session/modelCatalog` with custom-route fallback.
- Added Web controls for backend, background mode, dynamic routing, token/depth limits, persona, and tool filters.
- Moved authoritative state to the native `subagent-mgr` Harness settings namespace with revision-fenced browser writes.
- Added semantic Host validation for Web/settings writes using the existing profile validator.
- Added one-time non-destructive migration from the v0.1 JSON state file with an anti-resurrection marker.
- Kept `/subagents` as the stable CLI/TUI/Web command fallback.
- Added a prebuilt lazy-CJS client artifact so installation requires no external Harness build preset.
- Added browser handoff and settings-tab registration tests.

## 0.1.0 - 2026-09-06

- Initial profile-bundle release.
- Zero-YAML `/subagents` management command.
- Live add/set/route/persona/enable/disable/clone/remove lifecycle.
- Exact child LLM provider/model routing through native `agentOptions`.
- Dynamic model-selection toggle.
- Persona, tool filter, background mode, token cap, and depth controls.
- Capability-aware `doctor` checks.
- Atomic persistent state and cross-process hot reload.
