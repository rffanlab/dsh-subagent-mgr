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

test('client still registers the v0.4 lazy-CJS handoff contract', () => {
  const handoff = handoffOf()
  assert.equal(handoff.id, 'dsh-subagent-mgr')
  assert.equal(typeof handoff.factory, 'function')
})

test('client keeps the settings tab while adding observability dependencies', () => {
  const handoff = handoffOf()
  const exports = handoff.factory(specifier => {
    if (specifier === 'react') return {}
    throw new Error(`unexpected require: ${specifier}`)
  })
  assert.deepEqual(exports.inject, ['slots', 'settingsScope', 'uiSession', 'remote', 'remote.session', 'remote.commands'])
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
    uiSession: { adapter:{ current:{ getSnapshot(){ return { props:{ sessionId:'s1' } } } } } },
    remote: {
      session: {
        modelCatalog() {
          return Promise.resolve({
            ok:true,
            value:{ default:{ provider:'p', model:'m' }, groups:[], failures:[], routableProviders:[] },
          })
        },
      },
      commands: { execute(){ return Promise.resolve({ ok:true, value:{ result:{ kind:'success', text:'{"workers":[],"recent":[]}' } } }) } },
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

test('client keeps v0.4 capability hints and revision-fenced writes', () => {
  assert.match(code, /dsh-sdk/)
  assert.match(code, /claude-code/)
  assert.match(code, /清理不兼容选项/)
  assert.match(code, /scope\.mutate\(\[\{ op:'set', path:\['profiles'\]/)
  assert.match(code, /baseRevision/)
  assert.match(code, /externalConflict/)
})
