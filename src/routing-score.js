const GOALS = new Set(['balanced', 'quality', 'speed', 'cheap'])
const LOCAL_ROUTE_RE = /(?:^|[\W_])(ollama|vllm|lmstudio|sglang|local|localhost|127\.0\.0\.1)(?:$|[\W_])/i

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function round(value, digits = 3) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function normalizeGoal(value) {
  const goal = String(value || 'balanced').trim().toLowerCase()
  if (!GOALS.has(goal)) throw new Error(`goal must be one of: ${[...GOALS].join(', ')}`)
  return goal
}

function normalizeLimit(value) {
  if (value === undefined || value === '') return 3
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > 10) throw new Error('limit must be an integer from 1 to 10')
  return number
}

function normalizeTags(value) {
  if (value === undefined || value === null || value === '') return []
  const source = Array.isArray(value) ? value : String(value).split(',')
  return [...new Set(source.map(item => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 24)
}

function cjkTerms(text) {
  const out = []
  for (const match of String(text).matchAll(/[\p{Script=Han}]+/gu)) {
    const chars = [...match[0]]
    for (const char of chars) out.push(char)
    for (let i = 0; i + 1 < chars.length; i += 1) out.push(chars[i] + chars[i + 1])
  }
  return out
}

function lexicalTerms(text) {
  const normalized = String(text ?? '').toLowerCase()
  const words = [...normalized.matchAll(/[\p{L}\p{N}_-]{2,}/gu)].map(match => match[0])
  return new Set([...words, ...cjkTerms(normalized)])
}

function reliabilityOf(row, recent) {
  const calls = row?.calls ?? 0
  const successes = row?.successes ?? 0
  // Five virtual balanced-history calls keep cold workers competitive without
  // letting one lucky call dominate established evidence.
  const prior = 0.72
  const posterior = (successes + prior * 5) / (calls + 5)
  const localRecent = recent.filter(item => item.profileId === row?.id).slice(0, 8)
  const recentRate = localRecent.length >= 3
    ? localRecent.filter(item => item.outcome === 'success').length / localRecent.length
    : undefined
  const blended = recentRate === undefined ? posterior : posterior * 0.75 + recentRate * 0.25
  return {
    score: clamp01(blended),
    confidence: calls >= 20 ? 'high' : calls >= 6 ? 'medium' : calls > 0 ? 'low' : 'cold',
  }
}

function speedOf(row) {
  if (row?.avgDurationMs === null || row?.avgDurationMs === undefined) return { score: 0.5, label: 'unmeasured' }
  const ms = Math.max(0, Number(row.avgDurationMs))
  return { score: clamp01(1 / (1 + ms / 30_000)), label: `${Math.round(ms)}ms avg` }
}

function costPriorOf(profile) {
  const route = profile?.llmProvider && profile?.model ? `${profile.llmProvider}/${profile.model}` : 'inherit'
  if (LOCAL_ROUTE_RE.test(route)) return { score: 1, label: 'known-local route' }
  // These providers own their model route outside the parent Harness catalog;
  // an omitted agentOptions route must not be mistaken for a cheap/neutral
  // parent-model inheritance signal.
  if (profile?.backend === 'codex' || profile?.backend === 'claude-code') return { score: 0.35, label: 'external backend prior' }
  if (profile?.backend === 'acp' || profile?.backend === 'dsh-sdk') return { score: 0.45, label: 'backend-owned route prior' }
  if (route === 'inherit') return { score: 0.55, label: 'inherited/unknown route' }
  return { score: 0.4, label: 'explicit non-local route prior' }
}

function skillOf(profile, request) {
  const queryTerms = new Set([
    ...lexicalTerms(request.task),
    ...request.tags.flatMap(tag => [...lexicalTerms(tag)]),
  ])
  if (queryTerms.size === 0) return { score: 0.5, matched: 0, requested: 0 }
  const profileText = [
    profile.id,
    profile.toolName,
    profile.backend,
    profile.llmProvider,
    profile.model,
    profile.persona,
    ...(profile.allowTools ?? []),
  ].filter(Boolean).join(' ')
  const profileTerms = lexicalTerms(profileText)
  let matched = 0
  for (const term of queryTerms) if (profileTerms.has(term)) matched += 1
  const ratio = matched / queryTerms.size
  return {
    score: clamp01(0.25 + ratio * 0.75),
    matched,
    requested: queryTerms.size,
  }
}

function weightsFor(goal) {
  switch (goal) {
    case 'quality': return { reliability: 0.6, speed: 0.08, cost: 0.04, skill: 0.23, load: 0.05 }
    case 'speed': return { reliability: 0.25, speed: 0.4, cost: 0.08, skill: 0.12, load: 0.15 }
    case 'cheap': return { reliability: 0.25, speed: 0.08, cost: 0.45, skill: 0.17, load: 0.05 }
    default: return { reliability: 0.45, speed: 0.18, cost: 0.12, skill: 0.2, load: 0.05 }
  }
}

export function rankSubagents(profiles, telemetrySnapshot, rawRequest = {}) {
  const request = {
    goal: normalizeGoal(rawRequest.goal),
    task: String(rawRequest.task ?? '').trim().slice(0, 1200),
    tags: normalizeTags(rawRequest.tags),
    background: rawRequest.background === true,
    limit: normalizeLimit(rawRequest.limit),
  }
  const workers = new Map((telemetrySnapshot?.workers ?? []).map(row => [row.id, row]))
  const recent = Array.isArray(telemetrySnapshot?.recent) ? telemetrySnapshot.recent : []
  const weights = weightsFor(request.goal)
  const ranked = []

  for (const [id, profile] of Object.entries(profiles ?? {})) {
    if (!profile || profile.enabled === false || typeof profile.toolName !== 'string') continue
    if (request.background && profile.enableRunInBackground === false) continue

    const row = workers.get(id) ?? { id, calls: 0, successes: 0, failures: 0, running: 0, avgDurationMs: null }
    const reliability = reliabilityOf(row, recent)
    const speed = speedOf(row)
    const cost = costPriorOf(profile)
    const skill = skillOf({ id, ...profile }, request)
    const running = Math.max(0, Number(row.running ?? 0))
    const load = clamp01(1 / (1 + running * 0.7))
    const score = clamp01(
      reliability.score * weights.reliability
      + speed.score * weights.speed
      + cost.score * weights.cost
      + skill.score * weights.skill
      + load * weights.load,
    )

    ranked.push({
      id,
      toolName: profile.toolName,
      backend: profile.backend ?? 'unknown',
      configuredRoute: profile.llmProvider && profile.model ? `${profile.llmProvider}/${profile.model}` : 'inherit',
      score: round(score * 100, 1),
      reliability: round(reliability.score, 4),
      confidence: reliability.confidence,
      calls: row.calls ?? 0,
      successes: row.successes ?? 0,
      failures: row.failures ?? 0,
      speedScore: round(speed.score, 4),
      speedLabel: speed.label,
      costScore: round(cost.score, 4),
      costLabel: cost.label,
      skillScore: round(skill.score, 4),
      skillMatched: skill.matched,
      skillRequested: skill.requested,
      running,
      loadScore: round(load, 4),
      lastOutcome: row.lastOutcome ?? null,
      lastErrorCode: row.lastErrorCode ?? null,
      lastRoute: row.lastRoute ?? null,
    })
  }

  ranked.sort((left, right) => right.score - left.score || right.calls - left.calls || left.id.localeCompare(right.id))
  return {
    request,
    ranked: ranked.slice(0, request.limit),
    candidateCount: ranked.length,
  }
}

export function formatRouteAdvice(result) {
  const tags = result.request.tags.length ? result.request.tags.join(',') : '-'
  const lines = [
    'Subagent route recommendation (advisory only; no task was executed)',
    `goal=${result.request.goal} background=${result.request.background} tags=${tags}`,
  ]
  if (result.request.task) lines.push(`task=${result.request.task.slice(0, 240)}`)
  if (!result.ranked.length) {
    lines.push('No eligible managed subagents are currently available.')
    return lines.join('\n')
  }
  result.ranked.forEach((row, index) => {
    const reliability = `${Math.round(row.reliability * 100)}%/${row.confidence}`
    const skill = row.skillRequested ? `${row.skillMatched}/${row.skillRequested}` : 'n/a'
    lines.push(
      `${index + 1}. ${row.id} tool=${row.toolName} score=${row.score}`,
      `   reliability=${reliability} calls=${row.calls} speed=${row.speedLabel} running=${row.running} skill=${skill}`,
      `   cost-prior=${row.costLabel} configured=${row.configuredRoute} last=${row.lastRoute ?? '-'}${row.lastErrorCode ? ` error=${row.lastErrorCode}` : ''}`,
    )
  })
  lines.push('Call the recommended tool yourself if appropriate. This router never delegates, retries, or repeats side effects.')
  return lines.join('\n')
}
