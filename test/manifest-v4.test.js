import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('v4 manifest points Host and Client at hardened entries', () => {
  assert.equal(manifest.version, '0.4.0')
  assert.equal(manifest.main, './src/index.js')
  assert.equal(manifest.exports['.'], './src/index.js')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.exports['./backend-hints'], './src/backend-hints.js')
  assert.ok(manifest.files.includes('lib/client.js'))
  assert.equal(manifest.dsh.client.platform, 'web')
})
