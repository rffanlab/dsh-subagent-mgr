# Changelog

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
