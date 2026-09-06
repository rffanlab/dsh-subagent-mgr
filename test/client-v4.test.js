import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

function handoffOf() {
  let handoff
  const window = { __ModuleLoader__: { load(value) { handoff = value } } }
  new Function('window', code)(window)
  return handoff
}

test('v4 client registers lazy-CJS handoff', () => {
  const handoff = handoffOf()
  assert.equal(handoff.id, 'dsh-subagent-mgr')
  assert.equal(typeof handoff.factory, 'function')
})

test('v4 client exports the settings tab plugin', () => {
  const handoff = handoffOf()
  const exports = handoff.factory(specifier => {
    if (specifier === 'react') return {}
    throw new Error(`unexpected require: ${specifier}`)
  })
  assert.deepEqual(exports.inject, ['slots', 'settingsScope', 'remote', 'remote.session'])
  assert.equal(typeof exports.apply, 'function')

  const registrations = []
  const scope = {
    subscribe() { return () => {} },
    getSnapshot() { return { status:'ready', value:{ profiles:{} }, revision:7, writable:true } },
    mutate() { return Promise.resolve() },
  }
  const ctx = {
    settingsScope: {
      bind(spec) {
        assert.equal(spec.namespace, 'subagent-mgr')
        assert.equal(typeof spec.decode, 'function')
        return scope
      },
    },
    remote: {
      session: {
        modelCatalog() {
          return Promise.resolve({
            ok:true,
            value:{ default:{ provider:'p', model:'m' }, groups:[], failures:[], routableProviders:[] },
          })
        },
      },
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'settings.plugins.tab')
        return callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  exports.apply(ctx)
  assert.equal(registrations[0].options.id, 'subagents')
  assert.equal(registrations[0].options.label, '子代理')
})

test('v4 client carries capability hints and revision-fenced writes', () => {
  assert.match(code, /dsh-sdk/)
  assert.match(code, /claude-code/)
  assert.match(code, /清理不兼容选项/)
  assert.match(code, /scope\.mutate\(\[\{ op:'set', path:\['profiles'\]/)
  assert.match(code, /baseRevision/)
  assert.match(code, /externalConflict/)
})
