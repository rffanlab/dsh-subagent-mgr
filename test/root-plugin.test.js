import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const code = await readFile(new URL('../src/plugin.js', import.meta.url), 'utf8')

test('root plugin wires telemetry before delegating to the existing manager', () => {
  assert.match(code, /installTelemetry\(ctx\)/)
  assert.match(code, /return applyManager\(ctx, \.\.\.args\)/)
})

test('telemetry setup failure is isolated instead of becoming manager authority', () => {
  assert.match(code, /catch \(error\)/)
  assert.match(code, /continuing without observability/)
  const catchAt = code.indexOf('continuing without observability')
  const managerAt = code.indexOf('return applyManager')
  assert.ok(catchAt >= 0 && managerAt > catchAt)
})
