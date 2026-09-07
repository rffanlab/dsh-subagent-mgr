import { defineTool } from '@deepseek-ai/dsh-tools'
import { parseAssignments, parseBoolean, tokenize } from './core.js'
import { formatRouteAdvice, rankSubagents } from './routing-score.js'

const MANAGER_SETTINGS_NS = 'subagent-mgr'

function profilesFrom(ctx, telemetry) {
  const settings = typeof ctx.get === 'function' ? ctx.get('settings') : undefined
  try {
    const section = settings?.get?.(MANAGER_SETTINGS_NS)
    if (section?.profiles && typeof section.profiles === 'object' && !Array.isArray(section.profiles)) {
      return section.profiles
    }
  } catch {
    // Provider lifetime transitions are allowed. Telemetry's legacy attribution
    // snapshot is a read-only fallback and never becomes manager authority.
  }
  return telemetry?.legacyProfiles ?? {}
}

export function routeSnapshot(ctx, telemetry, request = {}) {
  const profiles = profilesFrom(ctx, telemetry)
  const telemetrySnapshot = telemetry && typeof telemetry.snapshot === 'function'
    ? telemetry.snapshot()
    : { workers: [], recent: [] }
  return rankSubagents(profiles, telemetrySnapshot, request)
}

function requestFromAssignments(input) {
  const values = parseAssignments(tokenize(input))
  const request = {
    ...(values.goal !== undefined ? { goal: values.goal } : {}),
    ...(values.task !== undefined ? { task: values.task } : {}),
    ...(values.tags !== undefined ? { tags: values.tags } : {}),
    ...(values.limit !== undefined ? { limit: values.limit } : {}),
  }
  if (values.background !== undefined) request.background = parseBoolean(values.background, 'background')
  for (const key of Object.keys(values)) {
    if (!['goal', 'task', 'tags', 'limit', 'background'].includes(key)) throw new Error(`unknown routing option: ${key}`)
  }
  return request
}

export { formatRouteAdvice, rankSubagents } from './routing-score.js'

export function installRouting(ctx, telemetry) {
  ctx.inject(['tools'], toolCtx => {
    const dispose = toolCtx.tools.register(defineTool({
      name: 'route_subagent',
      description: 'Rank managed subagent workers before delegation using observed success, latency, current load, route-cost priors, and task/persona lexical fit. Use this when multiple managed subagent tools are plausible or when quality/speed/cost trade-offs matter. This tool is advisory only: it never delegates, retries, or repeats work.',
      parameters: {
        task: { type: 'string', description: 'Short task summary used only for in-memory lexical fit; it is not persisted by the router.' },
        tags: { type: 'string', description: 'Optional comma-separated capability hints such as coding,review,research,bulk.' },
        goal: { type: 'string', description: 'Routing objective: balanced, quality, speed, or cheap.' },
        background: { type: 'boolean', description: 'Whether the planned delegation must support run_in_background.' },
        limit: { type: 'integer', description: 'Number of ranked candidates to return, 1-10.' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        return formatRouteAdvice(routeSnapshot(toolCtx, telemetry, args))
      },
      isConcurrencySafe: () => true,
    }))
    toolCtx.effect(() => dispose, 'dsh-subagent-mgr advisory routing tool')
  })

  ctx.inject(['commands'], commandCtx => {
    commandCtx.commands.register({
      name: 'subagent-route',
      description: 'rank managed subagents without dispatching work',
      input: { hint: 'goal=balanced|quality|speed|cheap [task="..."] [tags=a,b] [background=true|false] [limit=N]' },
      recordInput: false,
      handler: async invocation => {
        try {
          const request = String(invocation.rawInput ?? '').trim()
            ? requestFromAssignments(String(invocation.rawInput ?? '').trim())
            : {}
          return { kind: 'success', text: formatRouteAdvice(routeSnapshot(commandCtx, telemetry, request)) }
        } catch (error) {
          return { kind: 'error', text: error?.message ?? String(error) }
        }
      },
    })
  })
}
