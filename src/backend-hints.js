export const OFFICIAL_BACKEND_HINTS = Object.freeze({
  spawn: Object.freeze({
    agentOptions: true,
    depthLimit: true,
    toolFilter: true,
    persona: true,
    continuable: true,
    routeScope: 'parent',
    label: 'Spawn in-process',
  }),
  fork: Object.freeze({
    agentOptions: true,
    depthLimit: true,
    toolFilter: true,
    persona: true,
    continuable: true,
    routeScope: 'parent',
    label: 'Fork in-process',
  }),
  'dsh-sdk': Object.freeze({
    agentOptions: true,
    depthLimit: false,
    toolFilter: false,
    persona: false,
    continuable: false,
    routeScope: 'child',
    label: 'DSH SDK',
  }),
  codex: Object.freeze({
    agentOptions: false,
    depthLimit: false,
    toolFilter: false,
    persona: false,
    continuable: false,
    routeScope: 'backend',
    label: 'Codex',
  }),
  'claude-code': Object.freeze({
    agentOptions: false,
    depthLimit: false,
    toolFilter: false,
    persona: false,
    continuable: false,
    routeScope: 'backend',
    label: 'Claude Code',
  }),
  acp: Object.freeze({
    agentOptions: false,
    depthLimit: false,
    toolFilter: false,
    persona: false,
    continuable: false,
    routeScope: 'backend',
    label: 'ACP',
  }),
})

export function backendHint(name) {
  return OFFICIAL_BACKEND_HINTS[name]
}

export function hintedCompatibilityProblems(profile) {
  const hint = backendHint(profile.backend)
  if (hint === undefined) return []
  const problems = []
  const usesAgentOptions = profile.llmProvider !== undefined
    || profile.reasoningEffort !== undefined
    || profile.maxTokens !== undefined
    || profile.dynamicModelSelection === true
  if (usesAgentOptions && !hint.agentOptions) {
    problems.push(`${profile.backend} does not support child model/agentOptions overrides`)
  }
  if (profile.persona !== undefined && !hint.persona) {
    problems.push(`${profile.backend} does not support persona overrides`)
  }
  if ((profile.allowTools !== undefined || profile.denyTools !== undefined) && !hint.toolFilter) {
    problems.push(`${profile.backend} does not support tool filters`)
  }
  if (typeof profile.maxDepth === 'number' && !hint.depthLimit) {
    problems.push(`${profile.backend} cannot enforce numeric maxDepth; use provider-managed`)
  }
  if (profile.backgroundMode === 'continuable' && !hint.continuable) {
    problems.push(`${profile.backend} does not support continuable background children`)
  }
  return problems
}
