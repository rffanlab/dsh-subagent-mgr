# Changelog

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
