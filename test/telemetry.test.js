import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SubagentTelemetry } from '../src/telemetry.js'

function fakeContext(profile) {
  return {
    get(name) {
      if (name !== 'settings') return undefined
      return { get(ns) { return ns === 'subagent-mgr' ? { profiles: { worker: profile } } : undefined } }
    },
  }
}

test('telemetry records running, success, failure, dynamic routes, and reloads from disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-subagent-mgr-telemetry-'))
  const telemetryPath = join(dir, 'telemetry.json')
  const legacyPath = join(dir, 'legacy.json')
  const oldTelemetry = process.env.DSH_SUBAGENT_MGR_TELEMETRY
  const oldLegacy = process.env.DSH_SUBAGENT_MGR_STATE
  process.env.DSH_SUBAGENT_MGR_TELEMETRY = telemetryPath
  process.env.DSH_SUBAGENT_MGR_STATE = legacyPath
  try {
    const profile = {
      id: 'worker', enabled: true, backend: 'spawn', toolName: 'sub_worker',
      llmProvider: 'local', model: 'qwen', reasoningEffort: 'medium',
    }
    const telemetry = new SubagentTelemetry(fakeContext(profile))
    await telemetry.ready

    const firstExec = {
      name: 'sub_worker',
      arguments: { provider: 'strong', model: 'model-x', reasoning_effort: 'high' },
    }
    const resolved = telemetry.resolve(firstExec)
    assert.equal(resolved.id, 'worker')
    const first = telemetry.begin(resolved, firstExec)
    assert.equal(telemetry.snapshot().workers[0].running, 1)
    telemetry.finish(first, { isError: false })

    const second = telemetry.begin(resolved, { name: 'sub_worker', arguments: { run_in_background: true } })
    telemetry.finish(second, { isError: true, error: { code: 'child/refused', message: 'do not persist this text' } })
    await telemetry.flush()

    const snapshot = telemetry.snapshot()
    const worker = snapshot.workers[0]
    assert.equal(worker.calls, 2)
    assert.equal(worker.successes, 1)
    assert.equal(worker.failures, 1)
    assert.equal(worker.foregroundCalls, 1)
    assert.equal(worker.backgroundCalls, 1)
    assert.equal(worker.running, 0)
    assert.equal(snapshot.recent[0].errorCode, 'child/refused')
    assert.equal(snapshot.recent[1].route, 'strong/model-x@high')

    const raw = await readFile(telemetryPath, 'utf8')
    assert.doesNotMatch(raw, /do not persist this text/)

    const reloaded = new SubagentTelemetry(fakeContext(profile))
    await reloaded.ready
    assert.equal(reloaded.snapshot().workers[0].calls, 2)
    assert.equal(reloaded.snapshot().workers[0].running, 0)
  } finally {
    if (oldTelemetry === undefined) delete process.env.DSH_SUBAGENT_MGR_TELEMETRY
    else process.env.DSH_SUBAGENT_MGR_TELEMETRY = oldTelemetry
    if (oldLegacy === undefined) delete process.env.DSH_SUBAGENT_MGR_STATE
    else process.env.DSH_SUBAGENT_MGR_STATE = oldLegacy
    await rm(dir, { recursive: true, force: true })
  }
})

test('telemetry ignores ordinary tools that are not managed worker tool names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-subagent-mgr-telemetry-ignore-'))
  const oldTelemetry = process.env.DSH_SUBAGENT_MGR_TELEMETRY
  const oldLegacy = process.env.DSH_SUBAGENT_MGR_STATE
  process.env.DSH_SUBAGENT_MGR_TELEMETRY = join(dir, 'telemetry.json')
  process.env.DSH_SUBAGENT_MGR_STATE = join(dir, 'legacy.json')
  try {
    const telemetry = new SubagentTelemetry(fakeContext({ id:'worker', enabled:true, backend:'spawn', toolName:'sub_worker' }))
    await telemetry.ready
    assert.equal(telemetry.resolve({ name:'read_file', arguments:{} }), undefined)
    assert.equal(telemetry.snapshot().workers[0]?.calls ?? 0, 0)
  } finally {
    if (oldTelemetry === undefined) delete process.env.DSH_SUBAGENT_MGR_TELEMETRY
    else process.env.DSH_SUBAGENT_MGR_TELEMETRY = oldTelemetry
    if (oldLegacy === undefined) delete process.env.DSH_SUBAGENT_MGR_STATE
    else process.env.DSH_SUBAGENT_MGR_STATE = oldLegacy
    await rm(dir, { recursive:true, force:true })
  }
})
