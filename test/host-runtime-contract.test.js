import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const code = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')

test('host runtime awaits plugin activation and owns transactional rollback', () => {
  assert.match(code, /await fiber\.await\(\)/)
  assert.match(code, /transitionRuntime/)
  assert.match(code, /rollback was incomplete/)
})

test('settings writes validate current backend capabilities', () => {
  assert.match(code, /assertCompatible\(candidate\)/)
  assert.match(code, /settings reconcile failed; restoring previous roster/)
})

test('legacy JSON cannot resurrect after settings has become authoritative', () => {
  assert.match(code, /settingsEverBound/)
  assert.match(code, /refusing to fork state back into the legacy JSON file/)
})
