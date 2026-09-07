import { apply as applyManager } from './index.js'
import { installRouting } from './router.js'
import { installTelemetry } from './telemetry.js'

export * from './index.js'
export { rankSubagents, routeSnapshot, formatRouteAdvice, installRouting } from './router.js'
export { SubagentTelemetry, installTelemetry } from './telemetry.js'

/**
 * Root plugin entry. Telemetry and routing are intentionally advisory layers:
 * either may fail without becoming authority over manager state or child Fiber
 * lifecycle.
 */
export function apply(ctx, ...args) {
  let telemetry
  try {
    telemetry = installTelemetry(ctx)
  } catch (error) {
    console.error(`[dsh-subagent-mgr] telemetry setup failed; continuing without observability: ${error?.stack ?? error}`)
  }
  try {
    installRouting(ctx, telemetry)
  } catch (error) {
    console.error(`[dsh-subagent-mgr] routing setup failed; continuing without route advice: ${error?.stack ?? error}`)
  }
  return applyManager(ctx, ...args)
}
