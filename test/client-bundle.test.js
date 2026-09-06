import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

test('client bundle registers lazy-CJS handoff with the package id', () => {
  let handoff
  const window = { __ModuleLoader__: { load(value) { handoff = value } } }
  new Function('window', code)(window)
  assert.equal(handoff.id, 'dsh-subagent-mgr')
  assert.equal(typeof handoff.factory, 'function')
})

test('client bundle exports a settings tab plugin', () => {
  let handoff
  const window = { __ModuleLoader__: { load(value) { handoff = value } } }
  new Function('window', code)(window)
  const exports = handoff.factory((specifier) => {
    if (specifier === 'react') return {}
    if (specifier === 'react/jsx-runtime') return { jsx() {}, jsxs() {}, Fragment: Symbol('Fragment') }
    throw new Error(`unexpected require: ${specifier}`)
  })
  assert.deepEqual(exports.inject, ['slots', 'settingsScope', 'remote', 'remote.session'])
  assert.equal(typeof exports.apply, 'function')

  const registrations = []
  const scope = { subscribe() { return () => {} }, getSnapshot() { return { status: 'ready', value: { profiles: {} }, writable: true } }, set() { return Promise.resolve() } }
  const ctx = {
    settingsScope: { bind(spec) { assert.equal(spec.namespace, 'subagent-mgr'); return scope } },
    remote: { session: { modelCatalog() { return Promise.resolve({ ok: true, value: { default: { provider: 'p', model: 'm' }, groups: [], failures: [], routableProviders: [] } }) } } },
    slots: {
      inject(name, callback) { assert.equal(name, 'settings.plugins.tab'); return callback() },
      register(options, component) { registrations.push({ options, component }); return () => {} },
    },
  }
  exports.apply(ctx)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.id, 'subagents')
  assert.equal(registrations[0].options.label, '子代理')
  assert.equal(typeof registrations[0].component, 'function')
})

test('package manifest exposes and declares the web client bundle', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings-plugins'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-api-session-controller'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-api-remotes'))
})
