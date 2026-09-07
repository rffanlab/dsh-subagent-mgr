import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const code = await readFile(new URL('../src/plugin.js', import.meta.url), 'utf8')

test('root plugin wires telemetry and advisory routing before delegating to the existing manager', () => {
  assert.match(code, /telemetry = installTelemetry\(ctx\)/)
  assert.match(code, /installRouting\(ctx, telemetry\)/)
  assert.match(code, /return applyManager\(ctx, \.\.\.args\)/)
})

test('telemetry and routing setup failures are isolated instead of becoming manager authority', () => {
  assert.match(code, /continuing without observability/)
  assert.match(code, /continuing without route advice/)
  const telemetryAt = code.indexOf('continuing without observability')
  const routingAt = code.indexOf('continuing without route advice')
  const managerAt = code.indexOf('return applyManager')
  assert.ok(telemetryAt >= 0 && routingAt > telemetryAt && managerAt > routingAt)
})
