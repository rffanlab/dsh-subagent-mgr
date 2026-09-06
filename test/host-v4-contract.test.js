import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
const schema = await readFile(new URL('../src/settings-schema.js', import.meta.url), 'utf8')

test('v4 Host keeps transactional Fiber activation and settings rollback', () => {
  assert.match(source, /await fiber\.await\(\)/)
  assert.match(source, /transitionRuntime/)
  assert.match(source, /tx\.rollback\(\)/)
  assert.match(source, /settingsEverBound/)
})

test('v4 doctor preflights in-process model routes in parallel', () => {
  assert.match(source, /resolveModelInfo/)
  assert.match(source, /Promise\.all\(profiles\.map\(profile => routeDiagnostics/)
  assert.match(source, /routeScope/)
})

test('v4 settings schema is versioned and no longer uses z.any profile values', () => {
  assert.match(schema, /MANAGER_SETTINGS_VERSION = 1/)
  assert.match(schema, /z\.dict\(ProfileSettingsSchema\)/)
  assert.doesNotMatch(schema, /z\.dict\(z\.any\(\)\)/)
})
