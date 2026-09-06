import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const code = await readFile(new URL(`..${manifest.exports['./client'].slice(1)}`, import.meta.url), 'utf8')

test('declared client bundle registers lazy-CJS handoff with the package id', () => {
  let handoff
  const window = { __ModuleLoader__: { load(value) { handoff = value } } }
  new Function('window', code)(window)
  assert.equal(handoff.id, 'dsh-subagent-mgr')
  assert.equal(typeof handoff.factory, 'function')
})

test('declared client bundle exports a settings tab plugin', () => {
  let handoff
  const window = { __ModuleLoader__: { load(value) { handoff = value } } }
  new Function('window', code)(window)
  const exports = handoff.factory(specifier => {
    if (specifier === 'react') return {}
    throw new Error(`unexpected require: ${specifier}`)
  })
  assert.deepEqual(exports.inject, ['slots', 'settingsScope', 'remote', 'remote.session'])
  assert.equal(typeof exports.apply, 'function')

  const registrations = []
  const scope = {
    subscribe() { return () => {} },
    getSnapshot() { return { status:'ready', value:{ profiles:{} }, writable:true, revision:1 } },
    mutate() { return Promise.resolve() },
  }
  const ctx = {
    settingsScope: { bind(spec) { assert.equal(spec.namespace, 'subagent-mgr'); return scope } },
    remote: { session: { modelCatalog() { return Promise.resolve({ ok:true, value:{ default:{provider:'p',model:'m'}, groups:[], failures:[], routableProviders:[] } }) } } },
    slots: {
      inject(name, callback) { assert.equal(name, 'settings.plugins.tab'); return callback() },
      register(options, component) { registrations.push({ options, component }); return () => {} },
    },
  }
  exports.apply(ctx)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.id, 'subagents')
  assert.equal(registrations[0].options.label, '子代理')
})

test('client bundle contains revision and capability protection surfaces', () => {
  assert.match(code, /scope\.mutate/)
  assert.match(code, /externalConflict/)
  assert.match(code, /baseRevision/)
  assert.match(code, /清理不兼容选项/)
})

test('package manifest declares the current web client bundle', () => {
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings-plugins'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-api-session-controller'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-api-remotes'))
})
