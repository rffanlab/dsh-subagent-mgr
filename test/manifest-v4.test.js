import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('v0.5 manifest points at telemetry-enabled root while preserving canonical client', () => {
  assert.equal(manifest.version, '0.5.0')
  assert.equal(manifest.main, './src/plugin.js')
  assert.equal(manifest.exports['.'], './src/plugin.js')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.exports['./backend-hints'], './src/backend-hints.js')
  assert.equal(manifest.exports['./telemetry'], './src/telemetry.js')
  assert.ok(manifest.files.includes('lib/client.js'))
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-session'))
})
