import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const TELEMETRY_VERSION = 1
const RECENT_LIMIT = 100
const MANAGER_SETTINGS_NS = 'subagent-mgr'

function telemetryPathFromEnvironment() {
  if (process.env.DSH_SUBAGENT_MGR_TELEMETRY) return resolve(process.env.DSH_SUBAGENT_MGR_TELEMETRY)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'subagent-mgr-telemetry.json')
}

function legacyStatePathFromEnvironment() {
  if (process.env.DSH_SUBAGENT_MGR_STATE) return resolve(process.env.DSH_SUBAGENT_MGR_STATE)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'subagent-mgr.json')
}

function emptyPersistentState() {
  return { version: TELEMETRY_VERSION, workers: {}, recent: [] }
}

function nonNegative(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

function finiteDuration(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

function sanitizeWorker(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    calls: nonNegative(value.calls),
    successes: nonNegative(value.successes),
    failures: nonNegative(value.failures),
    foregroundCalls: nonNegative(value.foregroundCalls),
    backgroundCalls: nonNegative(value.backgroundCalls),
    totalDurationMs: finiteDuration(value.totalDurationMs),
    maxDurationMs: finiteDuration(value.maxDurationMs),
    lastDurationMs: finiteDuration(value.lastDurationMs),
    ...(typeof value.lastStartedAt === 'number' ? { lastStartedAt: value.lastStartedAt } : {}),
    ...(typeof value.lastFinishedAt === 'number' ? { lastFinishedAt: value.lastFinishedAt } : {}),
    ...(value.lastOutcome === 'success' || value.lastOutcome === 'error' ? { lastOutcome: value.lastOutcome } : {}),
    ...(typeof value.lastRoute === 'string' ? { lastRoute: value.lastRoute.slice(0, 240) } : {}),
    ...(typeof value.lastErrorCode === 'string' ? { lastErrorCode: value.lastErrorCode.slice(0, 120) } : {}),
    ...(value.lastBackground === true || value.lastBackground === false ? { lastBackground: value.lastBackground } : {}),
  }
}

function sanitizeRecent(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.profileId !== 'string') return undefined
  if (row.outcome !== 'success' && row.outcome !== 'error') return undefined
  return {
    profileId: row.profileId.slice(0, 48),
    toolName: typeof row.toolName === 'string' ? row.toolName.slice(0, 64) : '',
    startedAt: typeof row.startedAt === 'number' ? row.startedAt : 0,
    finishedAt: typeof row.finishedAt === 'number' ? row.finishedAt : 0,
    durationMs: finiteDuration(row.durationMs),
    outcome: row.outcome,
    background: row.background === true,
    ...(typeof row.route === 'string' ? { route: row.route.slice(0, 240) } : {}),
    ...(typeof row.errorCode === 'string' ? { errorCode: row.errorCode.slice(0, 120) } : {}),
  }
}

function sanitizePersistentState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== TELEMETRY_VERSION) {
    return emptyPersistentState()
  }
  const workers = {}
  if (raw.workers && typeof raw.workers === 'object' && !Array.isArray(raw.workers)) {
    for (const [id, value] of Object.entries(raw.workers)) workers[id] = sanitizeWorker(value)
  }
  const recent = Array.isArray(raw.recent)
    ? raw.recent.map(sanitizeRecent).filter(Boolean).slice(-RECENT_LIMIT)
    : []
  return { version: TELEMETRY_VERSION, workers, recent }
}

function routeOf(profile, exec) {
  const args = exec?.arguments && typeof exec.arguments === 'object' && !Array.isArray(exec.arguments)
    ? exec.arguments
    : {}
  const dynamicProvider = typeof args.provider === 'string' && args.provider.length ? args.provider : undefined
  const dynamicModel = typeof args.model === 'string' && args.model.length ? args.model : undefined
  const provider = dynamicProvider ?? profile.llmProvider
  const model = dynamicModel ?? profile.model
  if (provider && model) {
    const effort = typeof args.reasoning_effort === 'string' && args.reasoning_effort.length
      ? args.reasoning_effort
      : profile.reasoningEffort
    return `${provider}/${model}${effort ? `@${effort}` : ''}`
  }
  return 'inherit'
}

function backgroundOf(exec) {
  const args = exec?.arguments && typeof exec.arguments === 'object' && !Array.isArray(exec.arguments)
    ? exec.arguments
    : {}
  return args.run_in_background === true
}

function failureCode(result, thrown) {
  if (thrown !== undefined) {
    const code = thrown && typeof thrown === 'object' && typeof thrown.code === 'string' ? thrown.code : undefined
    return code ?? (thrown instanceof Error ? thrown.name : 'exception')
  }
  if (!result?.isError) return undefined
  const error = result.error
  if (error && typeof error === 'object') {
    if (typeof error.code === 'string') return error.code
    if (typeof error.kind === 'string') return error.kind
    if (typeof error.name === 'string') return error.name
  }
  return 'tool-error'
}

function currentProfiles(ctx, legacyProfiles) {
  const settings = typeof ctx.get === 'function' ? ctx.get('settings') : undefined
  try {
    const section = settings?.get?.(MANAGER_SETTINGS_NS)
    if (section?.profiles && typeof section.profiles === 'object' && !Array.isArray(section.profiles)) {
      return section.profiles
    }
  } catch {
    // Settings may be between provider lifetimes. The legacy snapshot below is
    // only a telemetry attribution fallback; it never becomes manager authority.
  }
  return legacyProfiles
}

function profileForTool(profiles, toolName) {
  for (const [id, profile] of Object.entries(profiles ?? {})) {
    if (profile && typeof profile === 'object' && profile.toolName === toolName) return { id, ...profile }
  }
  return undefined
}

export class SubagentTelemetry {
  constructor(ctx) {
    this.ctx = ctx
    this.path = telemetryPathFromEnvironment()
    this.legacyPath = legacyStatePathFromEnvironment()
    this.state = emptyPersistentState()
    this.running = new Map()
    this.legacyProfiles = {}
    this.writeTimer = undefined
    this.writeTail = Promise.resolve()
    this.ready = this.load()
  }

  async load() {
    try {
      this.state = sanitizePersistentState(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if (error?.code !== 'ENOENT') console.error(`[dsh-subagent-mgr] telemetry load failed; starting clean: ${error?.message ?? error}`)
    }
    await this.reloadLegacyProfiles()
  }

  async reloadLegacyProfiles() {
    try {
      const raw = JSON.parse(await readFile(this.legacyPath, 'utf8'))
      this.legacyProfiles = raw?.profiles && typeof raw.profiles === 'object' && !Array.isArray(raw.profiles) ? raw.profiles : {}
    } catch (error) {
      if (error?.code !== 'ENOENT') console.error(`[dsh-subagent-mgr] telemetry legacy roster read failed: ${error?.message ?? error}`)
      this.legacyProfiles = {}
    }
  }

  resolve(exec) {
    return profileForTool(currentProfiles(this.ctx, this.legacyProfiles), exec.name)
  }

  begin(profile, exec) {
    const startedAt = Date.now()
    const background = backgroundOf(exec)
    const route = routeOf(profile, exec)
    const running = this.running.get(profile.id) ?? 0
    this.running.set(profile.id, running + 1)
    return { profileId: profile.id, toolName: profile.toolName, startedAt, background, route }
  }

  finish(token, result, thrown) {
    const finishedAt = Date.now()
    const durationMs = Math.max(0, finishedAt - token.startedAt)
    const isError = thrown !== undefined || result?.isError === true
    const errorCode = failureCode(result, thrown)
    const current = sanitizeWorker(this.state.workers[token.profileId])
    current.calls += 1
    if (isError) current.failures += 1
    else current.successes += 1
    if (token.background) current.backgroundCalls += 1
    else current.foregroundCalls += 1
    current.totalDurationMs += durationMs
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs)
    current.lastDurationMs = durationMs
    current.lastStartedAt = token.startedAt
    current.lastFinishedAt = finishedAt
    current.lastOutcome = isError ? 'error' : 'success'
    current.lastRoute = token.route
    current.lastBackground = token.background
    if (errorCode) current.lastErrorCode = errorCode
    else delete current.lastErrorCode
    this.state.workers[token.profileId] = current

    const running = Math.max(0, (this.running.get(token.profileId) ?? 1) - 1)
    if (running === 0) this.running.delete(token.profileId)
    else this.running.set(token.profileId, running)

    this.state.recent.push({
      profileId: token.profileId,
      toolName: token.toolName,
      startedAt: token.startedAt,
      finishedAt,
      durationMs,
      outcome: isError ? 'error' : 'success',
      background: token.background,
      route: token.route,
      ...(errorCode ? { errorCode } : {}),
    })
    if (this.state.recent.length > RECENT_LIMIT) this.state.recent.splice(0, this.state.recent.length - RECENT_LIMIT)
    this.scheduleFlush()
  }

  scheduleFlush() {
    if (this.writeTimer !== undefined) return
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined
      void this.flush().catch(error => console.error(`[dsh-subagent-mgr] telemetry flush failed: ${error?.message ?? error}`))
    }, 750)
    this.writeTimer.unref?.()
  }

  async flush() {
    await this.ready
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer)
      this.writeTimer = undefined
    }
    const snapshot = JSON.stringify(this.state, null, 2) + '\n'
    this.writeTail = this.writeTail.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const temp = `${this.path}.${process.pid}.${Date.now()}.tmp`
      await writeFile(temp, snapshot, { mode: 0o600 })
      await rename(temp, this.path)
    })
    return this.writeTail
  }

  snapshot() {
    const profiles = currentProfiles(this.ctx, this.legacyProfiles)
    const ids = new Set([...Object.keys(profiles ?? {}), ...Object.keys(this.state.workers)])
    const workers = [...ids].sort().map(id => {
      const profile = profiles?.[id]
      const saved = sanitizeWorker(this.state.workers[id])
      const calls = saved.calls
      return {
        id,
        toolName: profile?.toolName ?? this.state.recent.findLast?.(row => row.profileId === id)?.toolName ?? '',
        backend: profile?.backend ?? null,
        configuredRoute: profile?.llmProvider && profile?.model ? `${profile.llmProvider}/${profile.model}` : 'inherit',
        enabled: profile?.enabled !== false && profile !== undefined,
        running: this.running.get(id) ?? 0,
        calls,
        successes: saved.successes,
        failures: saved.failures,
        foregroundCalls: saved.foregroundCalls,
        backgroundCalls: saved.backgroundCalls,
        successRate: calls === 0 ? null : saved.successes / calls,
        avgDurationMs: calls === 0 ? null : Math.round(saved.totalDurationMs / calls),
        maxDurationMs: saved.maxDurationMs,
        lastDurationMs: saved.lastDurationMs,
        lastStartedAt: saved.lastStartedAt ?? null,
        lastFinishedAt: saved.lastFinishedAt ?? null,
        lastOutcome: saved.lastOutcome ?? null,
        lastRoute: saved.lastRoute ?? null,
        lastErrorCode: saved.lastErrorCode ?? null,
        lastBackground: saved.lastBackground ?? null,
      }
    })
    return {
      version: TELEMETRY_VERSION,
      generatedAt: Date.now(),
      semantics: {
        duration: 'managed tool dispatch duration; foreground normally spans child completion, background spans scheduling/acceptance only',
        success: 'final managed tool result isError=false; background success means accepted/scheduled, not later child completion',
        tokens: 'not reported unless a future Harness contract exposes stable tool-call to child-usage attribution',
      },
      workers,
      recent: this.state.recent.slice(-25).toReversed(),
    }
  }

  reset(id) {
    if (id === 'all') {
      this.state = emptyPersistentState()
      this.running.clear()
      this.scheduleFlush()
      return true
    }
    if (!(id in this.state.workers) && !this.state.recent.some(row => row.profileId === id)) return false
    delete this.state.workers[id]
    this.state.recent = this.state.recent.filter(row => row.profileId !== id)
    this.running.delete(id)
    this.scheduleFlush()
    return true
  }
}

function formatStats(snapshot) {
  const lines = ['Subagent telemetry', 'calls  ok  fail  run  avg(ms)  bg  worker  route']
  for (const row of snapshot.workers) {
    lines.push([
      String(row.calls).padStart(5),
      String(row.successes).padStart(3),
      String(row.failures).padStart(4),
      String(row.running).padStart(3),
      String(row.avgDurationMs ?? '-').padStart(7),
      String(row.backgroundCalls).padStart(2),
      row.id,
      row.lastRoute ?? row.configuredRoute,
    ].join('  '))
  }
  if (snapshot.workers.length === 0) lines.push('(no managed worker calls recorded yet)')
  lines.push('', 'Note: background success/duration covers scheduling acceptance, not the child\'s later completion.')
  return lines.join('\n')
}

export function installTelemetry(ctx) {
  const telemetry = new SubagentTelemetry(ctx)

  ctx.effect(() => {
    let closed = false
    let timer
    const dir = dirname(telemetry.legacyPath)
    mkdir(dir, { recursive: true }).then(() => {
      if (closed) return
      const watcher = watch(dir, { persistent: false }, (_event, filename) => {
        if (filename && basename(String(filename)) !== basename(telemetry.legacyPath)) return
        clearTimeout(timer)
        timer = setTimeout(() => { void telemetry.reloadLegacyProfiles() }, 100)
        timer.unref?.()
      })
      if (closed) watcher.close()
      else ctx.effect(() => () => watcher.close(), 'dsh-subagent-mgr telemetry legacy roster watcher')
    }).catch(() => {})
    return () => { closed = true; clearTimeout(timer) }
  }, 'dsh-subagent-mgr telemetry watcher bootstrap')

  ctx.inject(['tools'], toolCtx => {
    const dispose = toolCtx.on('tools/execute', async (exec, next) => {
      await telemetry.ready
      const profile = telemetry.resolve(exec)
      if (profile === undefined) return next()
      const token = telemetry.begin(profile, exec)
      try {
        const result = await next()
        telemetry.finish(token, result)
        return result
      } catch (error) {
        telemetry.finish(token, undefined, error)
        throw error
      }
    })
    toolCtx.effect(() => dispose, 'dsh-subagent-mgr telemetry tool wrapper')
  })

  ctx.inject(['commands'], commandCtx => {
    commandCtx.commands.register({
      name: 'subagent-stats',
      description: 'show or reset dsh-subagent-mgr runtime telemetry',
      input: { hint: '[json|recent|reset <worker|all>]' },
      recordInput: false,
      handler: async invocation => {
        await telemetry.ready
        const input = String(invocation.rawInput ?? '').trim()
        const [op = 'show', arg] = input.split(/\s+/)
        if (op === 'json') return { kind: 'success', text: JSON.stringify(telemetry.snapshot()) }
        if (op === 'reset') {
          if (!arg) return { kind: 'error', text: 'usage: /subagent-stats reset <worker|all>' }
          const changed = telemetry.reset(arg)
          await telemetry.flush()
          return changed
            ? { kind: 'success', text: `Reset telemetry for ${arg}.` }
            : { kind: 'error', text: `No telemetry found for ${arg}.` }
        }
        if (op === 'recent') {
          const snapshot = telemetry.snapshot()
          const lines = snapshot.recent.map(row => `${row.outcome === 'success' ? 'OK' : 'ERR'} ${row.profileId} ${row.durationMs}ms ${row.background ? 'background' : 'foreground'} ${row.route ?? ''}${row.errorCode ? ` ${row.errorCode}` : ''}`)
          return { kind: 'success', text: lines.length ? lines.join('\n') : 'No recent subagent calls.' }
        }
        if (op !== 'show' && op !== '') return { kind: 'error', text: 'usage: /subagent-stats [json|recent|reset <worker|all>]' }
        return { kind: 'success', text: formatStats(telemetry.snapshot()) }
      },
    })
  })

  ctx.effect(() => async () => {
    await telemetry.flush().catch(() => {})
  }, 'dsh-subagent-mgr telemetry flush')

  return telemetry
}
