import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import z from '@deepseek-ai/schemastery'
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

export const name = 'dsh-subagent-mgr'
export const MANAGER_SETTINGS_NS = 'subagent-mgr'

/**
 * The browser edits one authoritative `profiles` map through Harness settings.
 * Detailed semantic validation stays in `validateStore()` so slash commands,
 * legacy import, file reload, and Web writes share exactly one rule set.
 */
export const ManagerSettingsSchema = z.object({
  profiles: z.dict(z.any()).default({}),
  migratedLegacy: z.boolean().default(false),
})

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

function storeFromSettings(value) {
  return validateStore({ version: 1, profiles: value?.profiles ?? {} })
}

function compatibilityProblems(profile, subagents) {
  const provider = subagents.getProvider(profile.backend)
  if (provider === undefined) return [`backend "${profile.backend}" is not registered right now`]
  const caps = provider.capabilities ?? {}
  const problems = []
  const hasAgentOptions = profile.llmProvider !== undefined || profile.reasoningEffort !== undefined || profile.maxTokens !== undefined
  if ((hasAgentOptions || profile.dynamicModelSelection) && !caps.agentOptions) {
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

function profileDetails(profile) {
  const lines = [
    formatProfile(profile),
    `enabled: ${profile.enabled}`,
    `backend: ${profile.backend}`,
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

export function apply(ctx) {
  const legacyPath = statePathFromEnvironment()
  let store = emptyStore()
  let storeFingerprint = ''
  let queue = Promise.resolve()
  let settingsOwnerScope
  const mounted = new Map()

  const serialize = task => {
    const next = queue.then(task, task)
    queue = next.catch(() => {})
    return next
  }

  const unmount = async id => {
    const entry = mounted.get(id)
    if (entry === undefined) return
    mounted.delete(id)
    await entry.fiber.dispose()
  }

  const mount = async profile => {
    const config = profileToToolConfig(profile)
    const fiber = ctx.plugin(toolSubagent, config)
    mounted.set(profile.id, { fiber, fingerprint: profileFingerprint(profile) })
  }

  const reconcile = async nextStore => {
    const enabledIds = new Set(Object.values(nextStore.profiles).filter(p => p.enabled).map(p => p.id))
    for (const id of [...mounted.keys()]) {
      if (!enabledIds.has(id)) await unmount(id)
    }
    for (const profile of Object.values(nextStore.profiles)) {
      if (!profile.enabled) continue
      const fingerprint = profileFingerprint(profile)
      const current = mounted.get(profile.id)
      if (current?.fingerprint === fingerprint) continue
      if (current !== undefined) await unmount(profile.id)
      await mount(profile)
    }
    store = nextStore
    storeFingerprint = JSON.stringify(nextStore)
  }

  const reload = async () => {
    const nextStore = settingsOwnerScope === undefined
      ? await readStore(legacyPath)
      : storeFromSettings(settingsOwnerScope.get())
    if (JSON.stringify(nextStore) === storeFingerprint) return false
    await reconcile(nextStore)
    return true
  }

  /** Persist first; only publish/mount a mutation after its durable owner accepts it. */
  const commit = async nextStore => {
    const normalized = validateStore(nextStore)
    if (settingsOwnerScope !== undefined) {
      await settingsOwnerScope.replace({ profiles: normalized.profiles, migratedLegacy: true })
      await reconcile(normalized)
    } else {
      await writeStore(legacyPath, normalized)
      await reconcile(normalized)
    }
    return normalized
  }

  // Legacy JSON remains an import/fallback path for older Harness profiles that
  // do not compose ctx.settings. Once settings appears it becomes authoritative.
  ctx.effect(() => {
    let closed = false
    let timer
    const dir = dirname(legacyPath)
    mkdir(dir, { recursive: true }).then(() => {
      if (closed) return
      const watcher = watch(dir, { persistent: false }, (_event, filename) => {
        if (filename && basename(String(filename)) !== basename(legacyPath)) return
        clearTimeout(timer)
        timer = setTimeout(() => serialize(reload).catch(error => {
          console.error(`[dsh-subagent-mgr] reload failed: ${error?.stack ?? error}`)
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

  // Keep the old file useful before settings activates; the settings binding
  // below imports it once when its own roster is still empty.
  serialize(async () => reconcile(await readStore(legacyPath))).catch(error => {
    console.error(`[dsh-subagent-mgr] initial legacy load failed: ${error?.stack ?? error}`)
  })

  ctx.inject(['settings'], settingsCtx => {
    const scope = settingsCtx.settings.register(MANAGER_SETTINGS_NS, ManagerSettingsSchema, {
      validate(value) {
        void storeFromSettings(value)
      },
    })
    settingsOwnerScope = scope

    const stopWatch = scope.watch((next) => {
      // Return immediately: Settings may await its observers. Reconciliation is
      // serialized outside that commit so a settings write cannot deadlock on us.
      void serialize(() => reconcile(storeFromSettings(next))).catch(error => {
        console.error(`[dsh-subagent-mgr] settings reconcile failed: ${error?.stack ?? error}`)
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
        // One-time non-destructive migration. The marker prevents an old backup
        // from resurrecting profiles after the user later deletes the whole roster.
        const target = Object.keys(fromSettings.profiles).length === 0 && Object.keys(legacy.profiles).length > 0
          ? legacy
          : fromSettings
        await scope.replace({ profiles: target.profiles, migratedLegacy: true })
        await reconcile(target)
        return
      }
      await reconcile(fromSettings)
    }).catch(error => {
      console.error(`[dsh-subagent-mgr] settings bootstrap failed: ${error?.stack ?? error}`)
    })
  })

  ctx.inject(['commands', 'subagents'], commandCtx => {
    commandCtx.commands.register({
      name: 'subagents',
      description: 'manage named subagent workers without editing YAML',
      input: { hint: '[list|add|set|route|persona|enable|disable|clone|rm|show|doctor|reload]' },
      handler: invocation => serialize(async () => {
        try {
          const tokens = tokenize(invocation.rawInput?.trim() ?? '')
          const op = tokens.shift()?.toLowerCase() ?? 'list'
          if (op === 'help' || op === '?') return { kind: 'success', text: helpText() }
          if (op === 'list' || op === 'ls') {
            const profiles = Object.values(store.profiles).sort((a, b) => a.id.localeCompare(b.id))
            return { kind: 'success', text: profiles.length ? profiles.map(formatProfile).join('\n') : 'No managed subagents. Try: /subagents add worker' }
          }
          if (op === 'show') {
            const id = tokens[0]
            const profile = store.profiles[id]
            if (!profile) return { kind: 'error', text: `unknown subagent: ${id}` }
            return { kind: 'success', text: profileDetails(profile) }
          }
          if (op === 'doctor') {
            const providers = commandCtx.subagents.list()
            const state = settingsOwnerScope === undefined ? `legacy file: ${legacyPath}` : `settings namespace: ${MANAGER_SETTINGS_NS}`
            const lines = [`state: ${state}`, `registered backends: ${providers.length ? providers.join(', ') : '(none)'}`]
            for (const profile of Object.values(store.profiles).sort((a, b) => a.id.localeCompare(b.id))) {
              const problems = compatibilityProblems(profile, commandCtx.subagents)
              lines.push(`${problems.length ? 'WARN' : 'OK'} ${profile.id}: ${problems.length ? problems.join('; ') : 'compatible with current backend capabilities'}`)
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
            const problems = compatibilityProblems(profile, commandCtx.subagents).filter(p => !p.includes('is not registered right now'))
            if (problems.length) return { kind: 'error', text: problems.join('\n') }
            const next = structuredClone(store)
            next.profiles[id] = profile
            await commit(next)
            return { kind: 'success', text: `Added ${formatProfile(profile)}` }
          }
          if (op === 'set') {
            const id = tokens.shift()
            const previous = store.profiles[id]
            if (!previous) return { kind: 'error', text: `unknown subagent: ${id}` }
            const profile = normalizeProfile(id, parseAssignments(tokens), previous)
            const problems = compatibilityProblems(profile, commandCtx.subagents).filter(p => !p.includes('is not registered right now'))
            if (problems.length) return { kind: 'error', text: problems.join('\n') }
            const next = structuredClone(store)
            next.profiles[id] = profile
            await commit(next)
            return { kind: 'success', text: `Updated ${formatProfile(profile)}` }
          }
          if (op === 'route') {
            const [id, provider, model, effort] = tokens
            const previous = store.profiles[id]
            if (!previous) return { kind: 'error', text: `unknown subagent: ${id}` }
            if (!provider || !model) return { kind: 'error', text: 'usage: /subagents route <id> <provider|inherit> <model|inherit> [effort|inherit]' }
            const input = provider === 'inherit' || model === 'inherit'
              ? { provider: 'inherit', model: 'inherit', ...(effort ? { effort } : {}) }
              : { provider, model, ...(effort ? { effort } : {}) }
            const profile = normalizeProfile(id, input, previous)
            const problems = compatibilityProblems(profile, commandCtx.subagents).filter(p => !p.includes('is not registered right now'))
            if (problems.length) return { kind: 'error', text: problems.join('\n') }
            const next = structuredClone(store)
            next.profiles[id] = profile
            await commit(next)
            return { kind: 'success', text: `Route updated: ${formatProfile(profile)}` }
          }
          if (op === 'persona') {
            const id = tokens.shift()
            const previous = store.profiles[id]
            if (!previous) return { kind: 'error', text: `unknown subagent: ${id}` }
            if (!tokens.length) return { kind: 'error', text: 'usage: /subagents persona <id> <text|inherit>' }
            const profile = normalizeProfile(id, { persona: tokens.join(' ') }, previous)
            const problems = compatibilityProblems(profile, commandCtx.subagents).filter(p => !p.includes('is not registered right now'))
            if (problems.length) return { kind: 'error', text: problems.join('\n') }
            const next = structuredClone(store)
            next.profiles[id] = profile
            await commit(next)
            return { kind: 'success', text: `Persona updated for ${id}.` }
          }
          if (op === 'enable' || op === 'disable') {
            const id = tokens[0]
            const previous = store.profiles[id]
            if (!previous) return { kind: 'error', text: `unknown subagent: ${id}` }
            const profile = normalizeProfile(id, { enabled: op === 'enable' ? 'true' : 'false' }, previous)
            const next = structuredClone(store)
            next.profiles[id] = profile
            await commit(next)
            return { kind: 'success', text: `${op === 'enable' ? 'Enabled' : 'Disabled'} ${id}.` }
          }
          if (op === 'clone') {
            const [source, target] = tokens
            if (!store.profiles[source]) return { kind: 'error', text: `unknown subagent: ${source}` }
            if (!target) return { kind: 'error', text: 'usage: /subagents clone <source> <target>' }
            if (store.profiles[target]) return { kind: 'error', text: `subagent already exists: ${target}` }
            const sourceProfile = store.profiles[source]
            const cloneInput = { ...sourceProfile, toolName: `sub_${target}` }
            delete cloneInput.id
            const profile = normalizeProfile(target, cloneInput)
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
