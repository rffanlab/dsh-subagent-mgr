const ID_RE = /^[a-z][a-z0-9_-]{0,47}$/
const TOOL_RE = /^[a-z][a-z0-9_-]{0,63}$/
const BACKGROUND_MODES = new Set(['one-shot', 'continuable'])
const BOOL_TRUE = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled'])
const BOOL_FALSE = new Set(['0', 'false', 'no', 'off', 'disable', 'disabled'])

export const STORE_VERSION = 1

export function emptyStore() {
  return { version: STORE_VERSION, profiles: {} }
}

export function tokenize(input) {
  const tokens = []
  let current = ''
  let quote = null
  let escaped = false
  for (const ch of String(input ?? '')) {
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (quote !== null) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (escaped) current += '\\'
  if (quote !== null) throw new Error('unclosed quote')
  if (current.length > 0) tokens.push(current)
  return tokens
}

export function parseAssignments(tokens) {
  const out = {}
  for (let i = 0; i < tokens.length; i += 1) {
    let token = tokens[i]
    if (token.startsWith('--')) token = token.slice(2)
    const eq = token.indexOf('=')
    if (eq > 0) {
      out[token.slice(0, eq)] = token.slice(eq + 1)
      continue
    }
    if (tokens[i].startsWith('--') && i + 1 < tokens.length && !tokens[i + 1].startsWith('--') && !tokens[i + 1].includes('=')) {
      out[token] = tokens[i + 1]
      i += 1
      continue
    }
    throw new Error(`expected key=value, got "${tokens[i]}"`)
  }
  return out
}

export function parseBoolean(value, key = 'value') {
  const normalized = String(value).trim().toLowerCase()
  if (BOOL_TRUE.has(normalized)) return true
  if (BOOL_FALSE.has(normalized)) return false
  throw new Error(`${key} must be true/false`)
}

function parsePositiveInt(value, key) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${key} must be a positive integer`)
  return number
}

function parseDepth(value) {
  if (String(value) === 'provider-managed') return 'provider-managed'
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('maxDepth must be a non-negative integer or provider-managed')
  return number
}

function splitList(value) {
  const items = String(value).split(',').map(v => v.trim()).filter(Boolean)
  return [...new Set(items)]
}

export function normalizeProfile(id, input = {}, previous) {
  if (!ID_RE.test(id)) throw new Error('id must match /^[a-z][a-z0-9_-]{0,47}$/')
  const profile = structuredClone(previous ?? {
    id,
    enabled: true,
    backend: 'spawn',
    toolName: `sub_${id}`,
    dynamicModelSelection: false,
    enableRunInBackground: true,
    backgroundMode: 'one-shot',
    maxDepth: 3,
  })
  profile.id = id

  const aliases = {
    backend: 'backend',
    subagentProvider: 'backend',
    tool: 'toolName',
    toolName: 'toolName',
    provider: 'llmProvider',
    llmProvider: 'llmProvider',
    model: 'model',
    effort: 'reasoningEffort',
    reasoningEffort: 'reasoningEffort',
    maxTokens: 'maxTokens',
    maxDepth: 'maxDepth',
    dynamic: 'dynamicModelSelection',
    dynamicModelSelection: 'dynamicModelSelection',
    runInBackground: 'enableRunInBackground',
    enableRunInBackground: 'enableRunInBackground',
    background: 'backgroundMode',
    backgroundMode: 'backgroundMode',
    persona: 'persona',
    allow: 'allowTools',
    allowTools: 'allowTools',
    deny: 'denyTools',
    denyTools: 'denyTools',
    enabled: 'enabled',
  }

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = aliases[rawKey]
    if (key === undefined) throw new Error(`unknown option: ${rawKey}`)
    switch (key) {
      case 'backend':
        if (!rawValue) throw new Error('backend cannot be empty')
        profile.backend = String(rawValue)
        break
      case 'toolName':
        if (!TOOL_RE.test(String(rawValue))) throw new Error('toolName must match /^[a-z][a-z0-9_-]{0,63}$/')
        profile.toolName = String(rawValue)
        break
      case 'llmProvider':
        profile.llmProvider = rawValue === '' || rawValue === 'inherit' ? undefined : String(rawValue)
        break
      case 'model':
        profile.model = rawValue === '' || rawValue === 'inherit' ? undefined : String(rawValue)
        break
      case 'reasoningEffort':
        profile.reasoningEffort = rawValue === '' || rawValue === 'inherit' ? undefined : String(rawValue)
        break
      case 'maxTokens':
        profile.maxTokens = rawValue === '' || rawValue === 'inherit' ? undefined : parsePositiveInt(rawValue, 'maxTokens')
        break
      case 'maxDepth':
        profile.maxDepth = parseDepth(rawValue)
        break
      case 'dynamicModelSelection':
      case 'enableRunInBackground':
      case 'enabled':
        profile[key] = parseBoolean(rawValue, key)
        break
      case 'backgroundMode':
        if (!BACKGROUND_MODES.has(String(rawValue))) throw new Error('backgroundMode must be one-shot or continuable')
        profile.backgroundMode = String(rawValue)
        break
      case 'persona':
        profile.persona = rawValue === '' || rawValue === 'inherit' ? undefined : String(rawValue)
        break
      case 'allowTools':
        profile.allowTools = rawValue === '' || rawValue === 'inherit' ? undefined : splitList(rawValue)
        break
      case 'denyTools':
        profile.denyTools = rawValue === '' || rawValue === 'inherit' ? undefined : splitList(rawValue)
        break
      default:
        throw new Error(`unsupported option: ${rawKey}`)
    }
  }

  if ((profile.llmProvider === undefined) !== (profile.model === undefined)) {
    throw new Error('provider and model must be set together (or both inherit)')
  }
  if (profile.allowTools?.length && profile.denyTools?.length) {
    const overlap = profile.allowTools.filter(name => profile.denyTools.includes(name))
    if (overlap.length) throw new Error(`tools cannot be both allowed and denied: ${overlap.join(', ')}`)
  }
  return profile
}

export function validateStore(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) throw new Error('store must be an object')
  if (store.version !== STORE_VERSION) throw new Error(`unsupported store version: ${store.version}`)
  if (!store.profiles || typeof store.profiles !== 'object' || Array.isArray(store.profiles)) throw new Error('profiles must be an object')
  const normalized = emptyStore()
  const toolNames = new Set()
  for (const [id, raw] of Object.entries(store.profiles)) {
    const input = { ...raw }
    delete input.id
    const profile = normalizeProfile(id, input)
    if (toolNames.has(profile.toolName)) throw new Error(`duplicate toolName: ${profile.toolName}`)
    toolNames.add(profile.toolName)
    normalized.profiles[id] = profile
  }
  return normalized
}

export function profileToToolConfig(profile) {
  const agentOptions = {}
  if (profile.llmProvider !== undefined) agentOptions.provider = profile.llmProvider
  if (profile.model !== undefined) agentOptions.model = profile.model
  if (profile.reasoningEffort !== undefined) agentOptions.reasoningEffort = profile.reasoningEffort
  if (profile.maxTokens !== undefined) agentOptions.maxTokens = profile.maxTokens

  const toolFilter = {}
  if (profile.allowTools !== undefined) toolFilter.allow = profile.allowTools
  if (profile.denyTools !== undefined) toolFilter.deny = profile.denyTools

  return {
    provider: profile.backend,
    toolName: profile.toolName,
    modelSelectionSettings: profile.dynamicModelSelection === true,
    enableRunInBackground: profile.enableRunInBackground !== false,
    backgroundMode: profile.backgroundMode ?? 'one-shot',
    ...(Object.keys(agentOptions).length ? { agentOptions } : {}),
    ...(profile.persona !== undefined ? { persona: profile.persona } : {}),
    ...(Object.keys(toolFilter).length ? { toolFilter } : {}),
    maxDepth: profile.maxDepth ?? 3,
  }
}

export function profileFingerprint(profile) {
  return JSON.stringify(profileToToolConfig(profile))
}

export function formatProfile(profile) {
  const route = profile.llmProvider === undefined ? 'inherit parent route' : `${profile.llmProvider}/${profile.model}`
  const effort = profile.reasoningEffort ? ` effort=${profile.reasoningEffort}` : ''
  const dynamic = profile.dynamicModelSelection ? ' dynamic-route=on' : ''
  const mode = `${profile.backgroundMode}${profile.enableRunInBackground === false ? ' (foreground-only)' : ''}`
  return `${profile.enabled ? '●' : '○'} ${profile.id}  tool=${profile.toolName}  backend=${profile.backend}  route=${route}${effort}${dynamic}  mode=${mode}`
}

export function helpText() {
  return [
    'Subagent Manager — no YAML required',
    '',
    '/subagents list',
    '/subagents add <id> [backend=spawn] [provider=<llm-provider> model=<model>] [effort=<id>] [dynamic=true|false]',
    '               [background=one-shot|continuable] [persona="..."] [maxTokens=N] [maxDepth=N|provider-managed]',
    '               [allow=tool1,tool2] [deny=tool3] [tool=sub_<id>]',
    '/subagents set <id> key=value ...',
    '/subagents route <id> <provider|inherit> <model|inherit> [effort|inherit]',
    '/subagents persona <id> <text|inherit>',
    '/subagents enable|disable <id>',
    '/subagents clone <source> <target>',
    '/subagents rm <id>',
    '/subagents show <id>',
    '/subagents doctor',
    '/subagents reload',
    '',
    'Examples:',
    '/subagents add local_worker provider=ollama model=qwen3.8:27b maxDepth=1',
    '/subagents add router backend=spawn dynamic=true background=continuable',
    '/subagents set local_worker persona="Do repetitive implementation and testing. Report blockers clearly."',
  ].join('\n')
}
