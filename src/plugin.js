import { apply as applyManager } from './index.js'
import { installTelemetry } from './telemetry.js'

export * from './index.js'
export { SubagentTelemetry, installTelemetry } from './telemetry.js'

/**
 * Root plugin entry. Telemetry is intentionally an independent observer: a
 * telemetry failure must not become an authority over manager state or child
 * Fiber lifecycle.
 */
export function apply(ctx, ...args) {
  try {
    installTelemetry(ctx)
  } catch (error) {
    console.error(`[dsh-subagent-mgr] telemetry setup failed; continuing without observability: ${error?.stack ?? error}`)
  }
  return applyManager(ctx, ...args)
}
