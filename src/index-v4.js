import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import * as toolSubagent from '@deepseek-ai/dsh-tool-subagent'
import {
  emptyStore,
  formatProfile,
  helpText,
  normalizeProfile,
  parseAssignments,
  profileFingerprint,
  profileToToolConfig,
  tokenize,
  validateStore,
} from './core.js'
import { backendHint, hintedCompatibilityProblems } from './backend-hints.js'
import {
  MANAGER_SETTINGS_VERSION,
  ManagerSettingsSchema,
} from './settings-schema.js'

export const name = 'dsh-subagent-mgr'
export const MANAGER_SETTINGS_NS = 'subagent-mgr'
export { ManagerSettingsSchema }

function statePathFromEnvironment() {
  if (process.env.DSH_SUBAGENT_MGR_STATE) return resolve(process.env.DSH_SUBAGENT_MGR_STATE)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'subagent-mgr.json')
}

async function readStore(path) {
  try {
    return validateStore(JSON.parse(await readFile(path, 'utf8')))
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyStore()
    throw error
  }
}

async function writeStore(path, store) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
  await rename(temp, path)
}

function settingsSection(store) {
  return {
    schemaVersion: MANAGER_SETTINGS_VERSION,
    profiles: store.profiles,
    migratedLegacy: true,
  }
}

function storeFromSettings(value) {
  return validateStore({ version: 1, profiles: value?.profiles ?? {} })
}

function liveCompatibilityProblems(profile, subagents) {
  const provider = subagents?.getProvider?.(profile.backend)
  if (provider === undefined) return [`backend "${profile.backend}" is not registered right now`]
  const caps = provider.capabilities ?? {}
  const problems = []
  const usesAgentOptions = profile.llmProvider !== undefined
    || profile.reasoningEffort !== undefined
    || profile.maxTokens !== undefined
    || profile.dynamicModelSelection === true
  if (usesAgentOptions && !caps.agentOptions) {
    problems.push(`backend "${profile.backend}" does not support child model/agentOptions overrides`)
  }
  if (profile.persona !== undefined && !caps.persona) {
    problems.push(`backend "${profile.backend}" does not support persona overrides`)
  }
  if ((profile.allowTools !== undefined || profile.denyTools !== undefined) && !caps.toolFilter) {
    problems.push(`backend "${profile.backend}" does not support tool filters`)
  }
  if (typeof profile.maxDepth === 'number' && !caps.depthLimit) {
    problems.push(`backend "${profile.backend}" cannot enforce numeric maxDepth; use maxDepth=provider-managed`)
  }
  if (profile.backgroundMode === 'continuable' && provider.prepareContinuable === undefined) {
    problems.push(`backend "${profile.backend}" does not support continuable background children`)
  }
  return problems
}

function compatibilityProblems(profile, subagents) {
  const all = [
    ...liveCompatibilityProblems(profile, subagents),
    ...hintedCompatibilityProblems(profile),
  ]
  return [...new Set(all)]
}

function hardCompatibilityProblems(profile, subagents) {
  return compatibilityProblems(profile, subagents)
    .filter(problem => !problem.includes('is not registered right now'))
}

function profileDetails(profile, mounted) {
  const hint = backendHint(profile.backend)
  const lines = [
    formatProfile(profile),
    `runtime: ${mounted ? 'mounted' : profile.enabled ? 'not mounted / waiting' : 'disabled'}`,
    `enabled: ${profile.enabled}`,
    `backend: ${profile.backend}${hint ? ` (${hint.label})` : ''}`,
    `toolName: ${profile.toolName}`,
    `dynamicModelSelection: ${profile.dynamicModelSelection}`,
    `enableRunInBackground: ${profile.enableRunInBackground}`,
    `backgroundMode: ${profile.backgroundMode}`,
    `maxDepth: ${profile.maxDepth}`,
  ]
  if (profile.llmProvider !== undefined) lines.push(`provider: ${profile.llmProvider}`, `model: ${profile.model}`)
  if (profile.reasoningEffort !== undefined) lines.push(`reasoningEffort: ${profile.reasoningEffort}`)
  if (profile.maxTokens !== undefined) lines.push(`maxTokens: ${profile.maxTokens}`)
  if (profile.persona !== undefined) lines.push(`persona: ${profile.persona}`)
  if (profile.allowTools !== undefined) lines.push(`allowTools: ${profile.allowTools.join(', ')}`)
  if (profile.denyTools !== undefined) lines.push(`denyTools: ${profile.denyTools.join(', ')}`)
  return lines.join('\n')
}

async function routeDiagnostics(profile, ctx) {
  if (!profile.enabled || profile.llmProvider === undefined || profile.model === undefined) return []
  const hint = backendHint(profile.backend)
  if (hint?.routeScope === 'child') {
    return [{ level: 'INFO', text: 'LLM route belongs to the child DSH runtime; parent Harness cannot verify it.' }]
  }
  if (hint?.routeScope === 'backend') {
    return [{ level: 'INFO', text: 'This backend owns its model route; parent Harness LLM catalog is not authoritative.' }]
  }
  if (hint === undefined) {
    return [{ level: 'INFO', text: 'Custom backend route ownership is unknown; skipped parent-catalog verification.' }]
  }

  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
  if (llm === undefined) return [{ level: 'WARN', text: 'LLM runtime is not available for route verification.' }]

  const provider = llm.listProviders().find(candidate => candidate.id === profile.llmProvider)
  if (provider === undefined) {
    return [{ level: 'WARN', text: `LLM provider "${profile.llmProvider}" is not registered in this Harness process.` }]
  }

  try {
    const info = await llm.resolveModelInfo(profile.llmProvider, profile.model)
    const diagnostics = [{ level: 'OK', text: `LLM route resolved: ${provider.name}/${info.name ?? info.id ?? profile.model}` }]
    if (profile.reasoningEffort !== undefined) {
      const efforts = info.reasoning?.efforts ?? []
      if (!efforts.some(effort => effort.id === profile.reasoningEffort)) {
        diagnostics.push({
          level: 'WARN',
          text: efforts.length
            ? `reasoning effort "${profile.reasoningEffort}" is not advertised; available: ${efforts.map(e => e.id).join(', ')}`
            : `model does not advertise reasoning efforts, but "${profile.reasoningEffort}" is configured`,
        })
      }
    }
    return diagnostics
  } catch (error) {
    return [{
      level: 'WARN',
      text: `LLM route ${profile.llmProvider}/${profile.model} failed exact-route preflight: ${error?.message ?? String(error)}`,
    }]
  }
}

export function apply(ctx) {
  const legacyPath = statePathFromEnvironment()
  let store = emptyStore()
  let storeFingerprint = JSON.stringify(store)
  let queue = Promise.resolve()
  let settingsOwnerScope
  let settingsEverBound = false
  let selfSettingsWriteFingerprint
  const mounted = new Map()

  const serialize = task => {
    const next = queue.then(task, task)
    queue = next.catch(() => {})
    return next
  }

  const currentSubagents = () => typeof ctx.get === 'function' ? ctx.get('subagents') : undefined

  const assertCompatible = candidate => {
    const subagents = currentSubagents()
    const failures = []
    for (const profile of Object.values(candidate.profiles)) {
      if (!profile.enabled) continue
      for (const problem of hardCompatibilityProblems(profile, subagents)) {
        failures.push(`${profile.id}: ${problem}`)
      }
    }
    if (failures.length) {
      throw new Error(`subagent configuration is incompatible with the live Harness runtime:\n${failures.join('\n')}`)
    }
  }

  const unmount = async id => {
    const entry = mounted.get(id)
    if (entry === undefined) return
    mounted.delete(id)
    await entry.fiber.dispose()
  }

  const mount = async profile => {
    const fiber = ctx.plugin(toolSubagent, profileToToolConfig(profile))
    try {
      await fiber.await()
    } catch (error) {
      await Promise.resolve(fiber.dispose()).catch(() => {})
      throw error
    }
    mounted.set(profile.id, {
      fiber,
      fingerprint: profileFingerprint(profile),
      profile: structuredClone(profile),
    })
  }

  const transitionRuntime = async nextStore => {
    assertCompatible(nextStore)
    const undo = []
    try {
      const targets = Object.values(nextStore.profiles).filter(profile => profile.enabled)
      const targetIds = new Set(targets.map(profile => profile.id))

      for (const profile of targets) {
        const fingerprint = profileFingerprint(profile)
        const current = mounted.get(profile.id)
        if (current?.fingerprint === fingerprint) continue

        if (current === undefined) {
          await mount(profile)
          undo.push(async () => { await unmount(profile.id) })
          continue
        }

        const previous = structuredClone(current.profile)
        await unmount(profile.id)
        try {
          await mount(profile)
        } catch (error) {
          await mount(previous)
          throw error
        }
        undo.push(async () => {
          await unmount(profile.id)
          await mount(previous)
        })
      }

      for (const [id, current] of [...mounted.entries()]) {
        if (targetIds.has(id)) continue
        const previous = structuredClone(current.profile)
        await unmount(id)
        undo.push(async () => { await mount(previous) })
      }
    } catch (error) {
      const rollbackErrors = []
      for (const revert of undo.reverse()) {
        try { await revert() } catch (rollbackError) { rollbackErrors.push(rollbackError) }
      }
      if (rollbackErrors.length) {
        throw new AggregateError([error, ...rollbackErrors], 'subagent runtime transition failed and rollback was incomplete')
      }
      throw error
    }

    let closed = false
    return {
      commit() {
        if (closed) return
        closed = true
        store = nextStore
        storeFingerprint = JSON.stringify(nextStore)
      },
      async rollback() {
        if (closed) return
        closed = true
        const rollbackErrors = []
        for (const revert of undo.reverse()) {
          try { await revert() } catch (error) { rollbackErrors.push(error) }
        }
        if (rollbackErrors.length) throw new AggregateError(rollbackErrors, 'subagent runtime rollback failed')
      },
    }
  }

  const reconcileExternal = async nextStore => {
    const normalized = validateStore(nextStore)
    if (JSON.stringify(normalized) === storeFingerprint) return false
    const tx = await transitionRuntime(normalized)
    tx.commit()
    return true
  }

  const reload = async () => {
    if (settingsOwnerScope !== undefined) return reconcileExternal(storeFromSettings(settingsOwnerScope.get()))
    if (settingsEverBound) return false
    return reconcileExternal(await readStore(legacyPath))
  }

  const commit = async nextStore => {
    const normalized = validateStore(nextStore)
    assertCompatible(normalized)
    if (settingsEverBound && settingsOwnerScope === undefined) {
      throw new Error('Harness settings is temporarily unavailable; refusing to fork state back into the legacy JSON file')
    }

    const tx = await transitionRuntime(normalized)
    try {
      if (settingsOwnerScope !== undefined) {
        selfSettingsWriteFingerprint = JSON.stringify(normalized)
        await settingsOwnerScope.replace(settingsSection(normalized))
      } else {
        await writeStore(legacyPath, normalized)
      }
      tx.commit()
    } catch (error) {
      selfSettingsWriteFingerprint = undefined
      try {
        await tx.rollback()
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'subagent state write failed and runtime rollback was incomplete')
      }
      throw error
    }
    return normalized
  }

  ctx.effect(() => {
    let closed = false
    let timer
    const dir = dirname(legacyPath)
    mkdir(dir, { recursive: true }).then(() => {
      if (closed) return
      const watcher = watch(dir, { persistent: false }, (_event, filename) => {
        if (settingsEverBound || settingsOwnerScope !== undefined) return
        if (filename && basename(String(filename)) !== basename(legacyPath)) return
        clearTimeout(timer)
        timer = setTimeout(() => serialize(reload).catch(error => {
          console.error(`[dsh-subagent-mgr] legacy reload failed: ${error?.stack ?? error}`)
        }), 80)
      })
      if (closed) watcher.close()
      else ctx.effect(() => () => watcher.close(), 'dsh-subagent-mgr legacy state watcher')
    }).catch(error => console.error(`[dsh-subagent-mgr] cannot watch legacy state directory: ${error?.stack ?? error}`))
    return () => {
      closed = true
      clearTimeout(timer)
    }
  }, 'dsh-subagent-mgr legacy watcher bootstrap')

  serialize(async () => reconcileExternal(await readStore(legacyPath))).catch(error => {
    console.error(`[dsh-subagent-mgr] initial legacy load failed: ${error?.stack ?? error}`)
  })

  ctx.inject(['settings'], settingsCtx => {
    settingsEverBound = true
    const scope = settingsCtx.settings.register(MANAGER_SETTINGS_NS, ManagerSettingsSchema, {
      validate(value) {
        const candidate = storeFromSettings(value)
        assertCompatible(candidate)
      },
    })
    settingsOwnerScope = scope

    const stopWatch = scope.watch(next => {
      const candidate = storeFromSettings(next)
      const fingerprint = JSON.stringify(candidate)
      if (selfSettingsWriteFingerprint === fingerprint) {
        selfSettingsWriteFingerprint = undefined
        return
      }

      void serialize(async () => {
        const previous = structuredClone(store)
        try {
          await reconcileExternal(candidate)
        } catch (error) {
          console.error(`[dsh-subagent-mgr] settings reconcile failed; restoring previous roster: ${error?.stack ?? error}`)
          selfSettingsWriteFingerprint = JSON.stringify(previous)
          try {
            await scope.replace(settingsSection(previous))
          } catch (restoreError) {
            selfSettingsWriteFingerprint = undefined
            console.error(`[dsh-subagent-mgr] settings rollback failed: ${restoreError?.stack ?? restoreError}`)
          }
        }
      })
    })

    settingsCtx.effect(() => stopWatch, 'dsh-subagent-mgr settings watcher')
    settingsCtx.effect(() => () => {
      if (settingsOwnerScope === scope) settingsOwnerScope = undefined
    }, 'dsh-subagent-mgr settings binding')

    void serialize(async () => {
      const settingsValue = scope.get()
      const fromSettings = storeFromSettings(settingsValue)
      const legacy = await readStore(legacyPath)
      if (settingsValue.migratedLegacy !== true) {
        const target = Object.keys(fromSettings.profiles).length === 0 && Object.keys(legacy.profiles).length > 0
          ? legacy
          : fromSettings
        selfSettingsWriteFingerprint = JSON.stringify(target)
        await scope.replace(settingsSection(target))
        await reconcileExternal(target)
        return
      }
      if (settingsValue.schemaVersion !== MANAGER_SETTINGS_VERSION) {
        selfSettingsWriteFingerprint = JSON.stringify(fromSettings)
        await scope.replace(settingsSection(fromSettings))
      }
      await reconcileExternal(fromSettings)
    }).catch(error => {
      console.error(`[dsh-subagent-mgr] settings bootstrap failed: ${error?.stack ?? error}`)
    })
  })

  const mutateProfile = async (id, updater) => {
    const previous = store.profiles[id]
    if (!previous) throw new Error(`unknown subagent: ${id}`)
    const profile = updater(previous)
    const problems = hardCompatibilityProblems(profile, currentSubagents())
    if (problems.length) throw new Error(problems.join('\n'))
    const next = structuredClone(store)
    next.profiles[id] = profile
    await commit(next)
    return profile
  }

  ctx.inject(['commands', 'subagents'], commandCtx => {
    commandCtx.commands.register({
      name: 'subagents',
      description: 'manage and diagnose named subagent workers without editing YAML',
      input: { hint: '[list|add|set|route|persona|enable|disable|clone|rm|show|doctor|reload]' },
      handler: invocation => serialize(async () => {
        try {
          const tokens = tokenize(invocation.rawInput?.trim() ?? '')
          const op = tokens.shift()?.toLowerCase() ?? 'list'

          if (op === 'help' || op === '?') return { kind: 'success', text: helpText() }
          if (op === 'list' || op === 'ls') {
            const profiles = Object.values(store.profiles).sort((a, b) => a.id.localeCompare(b.id))
            return {
              kind: 'success',
              text: profiles.length
                ? profiles.map(profile => `${mounted.has(profile.id) ? '✓' : profile.enabled ? '…' : '○'} ${formatProfile(profile)}`).join('\n')
                : 'No managed subagents. Try: /subagents add worker',
            }
          }
          if (op === 'show') {
            const id = tokens[0]
            const profile = store.profiles[id]
            if (!profile) return { kind: 'error', text: `unknown subagent: ${id}` }
            return { kind: 'success', text: profileDetails(profile, mounted.has(id)) }
          }
          if (op === 'doctor' || op === 'health') {
            const providers = commandCtx.subagents.list()
            const state = settingsOwnerScope === undefined
              ? settingsEverBound ? 'settings temporarily unavailable' : `legacy file: ${legacyPath}`
              : `settings namespace: ${MANAGER_SETTINGS_NS} v${MANAGER_SETTINGS_VERSION}`
            const lines = [
              `state: ${state}`,
              `tool-subagent API: ${typeof toolSubagent.apply === 'function' ? 'present' : 'missing'}`,
              `registered backends: ${providers.length ? providers.join(', ') : '(none)'}`,
            ]
            const profiles = Object.values(store.profiles).sort((a, b) => a.id.localeCompare(b.id))
            const routeRows = await Promise.all(profiles.map(profile => routeDiagnostics(profile, commandCtx)))
            for (let index = 0; index < profiles.length; index += 1) {
              const profile = profiles[index]
              const problems = compatibilityProblems(profile, commandCtx.subagents)
              const runtime = mounted.has(profile.id) ? 'mounted' : profile.enabled ? 'waiting' : 'disabled'
              lines.push(`${problems.length ? 'WARN' : 'OK'} ${profile.id} [${runtime}]: ${problems.length ? problems.join('; ') : 'compatible with current backend capabilities'}`)
              for (const diagnostic of routeRows[index]) {
                lines.push(`  ${diagnostic.level} route: ${diagnostic.text}`)
              }
            }
            return { kind: 'success', text: lines.join('\n') }
          }
          if (op === 'reload') {
            const changed = await reload()
            return { kind: 'success', text: changed ? 'Reloaded subagent manager state.' : 'State already current.' }
          }
          if (op === 'add') {
            const id = tokens.shift()
            if (!id) return { kind: 'error', text: 'usage: /subagents add <id> [key=value ...]' }
            if (store.profiles[id]) return { kind: 'error', text: `subagent already exists: ${id}` }
            const profile = normalizeProfile(id, parseAssignments(tokens))
            const problems = hardCompatibilityProblems(profile, commandCtx.subagents)
            if (problems.length) return { kind: 'error', text: problems.join('\n') }
            const next = structuredClone(store)
            next.profiles[id] = profile
            await commit(next)
            return { kind: 'success', text: `Added ${formatProfile(profile)}` }
          }
          if (op === 'set') {
            const id = tokens.shift()
            if (!id) return { kind: 'error', text: 'usage: /subagents set <id> key=value ...' }
            const profile = await mutateProfile(id, previous => normalizeProfile(id, parseAssignments(tokens), previous))
            return { kind: 'success', text: `Updated ${formatProfile(profile)}` }
          }
          if (op === 'route') {
            const [id, provider, model, effort] = tokens
            if (!id || !provider || !model) {
              return { kind: 'error', text: 'usage: /subagents route <id> <provider|inherit> <model|inherit> [effort|inherit]' }
            }
            const input = provider === 'inherit' || model === 'inherit'
              ? { provider: 'inherit', model: 'inherit', ...(effort ? { effort } : {}) }
              : { provider, model, ...(effort ? { effort } : {}) }
            const profile = await mutateProfile(id, previous => normalizeProfile(id, input, previous))
            return { kind: 'success', text: `Route updated: ${formatProfile(profile)}` }
          }
          if (op === 'persona') {
            const id = tokens.shift()
            if (!id || !tokens.length) return { kind: 'error', text: 'usage: /subagents persona <id> <text|inherit>' }
            const profile = await mutateProfile(id, previous => normalizeProfile(id, { persona: tokens.join(' ') }, previous))
            return { kind: 'success', text: `Persona updated for ${profile.id}.` }
          }
          if (op === 'enable' || op === 'disable') {
            const id = tokens[0]
            if (!id) return { kind: 'error', text: `usage: /subagents ${op} <id>` }
            await mutateProfile(id, previous => normalizeProfile(id, { enabled: op === 'enable' ? 'true' : 'false' }, previous))
            return { kind: 'success', text: `${op === 'enable' ? 'Enabled' : 'Disabled'} ${id}.` }
          }
          if (op === 'clone') {
            const [source, target] = tokens
            const sourceProfile = store.profiles[source]
            if (!sourceProfile) return { kind: 'error', text: `unknown subagent: ${source}` }
            if (!target) return { kind: 'error', text: 'usage: /subagents clone <source> <target>' }
            if (store.profiles[target]) return { kind: 'error', text: `subagent already exists: ${target}` }
            const cloneInput = { ...sourceProfile, toolName: `sub_${target}` }
            delete cloneInput.id
            const profile = normalizeProfile(target, cloneInput)
            const problems = hardCompatibilityProblems(profile, commandCtx.subagents)
            if (problems.length) return { kind: 'error', text: problems.join('\n') }
            const next = structuredClone(store)
            next.profiles[target] = profile
            await commit(next)
            return { kind: 'success', text: `Cloned ${source} -> ${formatProfile(profile)}` }
          }
          if (op === 'rm' || op === 'remove' || op === 'delete') {
            const id = tokens[0]
            if (!store.profiles[id]) return { kind: 'error', text: `unknown subagent: ${id}` }
            const next = structuredClone(store)
            delete next.profiles[id]
            await commit(next)
            return { kind: 'success', text: `Removed ${id}.` }
          }
          return { kind: 'error', text: `unknown operation: ${op}\n\n${helpText()}` }
        } catch (error) {
          return { kind: 'error', text: error?.message ?? String(error) }
        }
      }),
    })
  })
}
