import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const code = await readFile(new URL(`..${manifest.exports['./client'].slice(1)}`, import.meta.url), 'utf8')

function clientExports() {
  let handoff
  const window = { __ModuleLoader__: { load(value) { handoff = value } } }
  new Function('window', code)(window)
  return { handoff, exports: handoff.factory(specifier => {
    if (specifier === 'react') return {}
    throw new Error(`unexpected require: ${specifier}`)
  }) }
}

test('declared client bundle registers lazy-CJS handoff with the package id', () => {
  const { handoff } = clientExports()
  assert.equal(handoff.id, 'dsh-subagent-mgr')
  assert.equal(typeof handoff.factory, 'function')
})

test('declared client bundle exports the settings tab plugin', () => {
  const { exports } = clientExports()
  assert.deepEqual(exports.inject, ['slots', 'settingsScope', 'uiSession', 'remote', 'remote.session', 'remote.commands'])
  assert.equal(typeof exports.apply, 'function')

  const registrations = []
  const scope = {
    subscribe() { return () => {} },
    getSnapshot() { return { status:'ready', value:{ profiles:{} }, writable:true, revision:1 } },
    mutate() { return Promise.resolve() },
  }
  const ctx = {
    settingsScope: { bind(spec) { assert.equal(spec.namespace, 'subagent-mgr'); return scope } },
    uiSession: { adapter: { current: { getSnapshot() { return { props:{ sessionId:'s1' } } } } } },
    remote: {
      session: { modelCatalog() { return Promise.resolve({ ok:true, value:{ default:{provider:'p',model:'m'}, groups:[], failures:[], routableProviders:[] } }) } },
      commands: { execute() { return Promise.resolve({ ok:true, value:{ result:{ kind:'success', text:'{"workers":[],"recent":[]}' } } }) } },
    },
    slots: {
      inject(name, callback) { assert.equal(name, 'settings.plugins.tab'); return callback() },
      register(options, component) { registrations.push({ options, component }); return () => {} },
    },
  }
  exports.apply(ctx)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.id, 'subagents')
  assert.equal(registrations[0].options.label, '子代理')
  assert.deepEqual(Object.keys(registrations[0].options.inject()).sort(), ['loadCatalog', 'loadStats', 'scope'])
})

test('client bundle contains revision, capability, and telemetry protection surfaces', () => {
  assert.match(code, /scope\.mutate/)
  assert.match(code, /externalConflict/)
  assert.match(code, /baseRevision/)
  assert.match(code, /清理不兼容选项/)
  assert.match(code, /\/subagent-stats json/)
  assert.match(code, /刷新统计/)
  assert.match(code, /后台调用的 success \/ duration 只代表任务被接受并进入调度/)
  assert.doesNotMatch(code, /setInterval\(/)
})

test('package manifest declares the current web client bundle and uiSession edge', () => {
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings-plugins'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-session'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-api-session-controller'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-api-remotes'))
})
