import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyStore,
  normalizeProfile,
  parseAssignments,
  profileToToolConfig,
  tokenize,
  validateStore,
} from '../src/core.js'

test('tokenize supports quoted persona text', () => {
  assert.deepEqual(tokenize('add worker provider=ollama persona="do boring work well"'), [
    'add', 'worker', 'provider=ollama', 'persona=do boring work well',
  ])
})

test('parseAssignments supports --key value and key=value', () => {
  assert.deepEqual(parseAssignments(['provider=ollama', '--model', 'qwen3:27b']), {
    provider: 'ollama', model: 'qwen3:27b',
  })
})

test('normalizeProfile creates safe tool names and exact model route', () => {
  const profile = normalizeProfile('worker', { provider: 'ollama', model: 'qwen3:27b', maxDepth: '1' })
  assert.equal(profile.toolName, 'sub_worker')
  assert.equal(profile.llmProvider, 'ollama')
  assert.equal(profile.model, 'qwen3:27b')
  assert.equal(profile.maxDepth, 1)
})

test('provider and model are atomic', () => {
  assert.throws(() => normalizeProfile('worker', { provider: 'ollama' }), /provider and model must be set together/)
})

test('profile maps to native dsh-tool-subagent config', () => {
  const profile = normalizeProfile('worker', {
    provider: 'ollama',
    model: 'qwen3:27b',
    effort: 'high',
    background: 'continuable',
    dynamic: 'true',
    allow: 'read_file,grep',
  })
  assert.deepEqual(profileToToolConfig(profile), {
    provider: 'spawn',
    toolName: 'sub_worker',
    modelSelectionSettings: true,
    enableRunInBackground: true,
    backgroundMode: 'continuable',
    agentOptions: { provider: 'ollama', model: 'qwen3:27b', reasoningEffort: 'high' },
    toolFilter: { allow: ['read_file', 'grep'] },
    maxDepth: 3,
  })
})

test('store rejects duplicate tool names', () => {
  const store = emptyStore()
  store.profiles.a = normalizeProfile('a', { tool: 'same' })
  store.profiles.b = normalizeProfile('b', { tool: 'same' })
  assert.throws(() => validateStore(store), /duplicate toolName/)
})

test('persisted profiles round-trip through validation', () => {
  const store = emptyStore()
  store.profiles.worker = normalizeProfile('worker', {
    provider: 'ollama', model: 'qwen3:27b', persona: 'do the work', dynamic: 'true',
  })
  const loaded = validateStore(JSON.parse(JSON.stringify(store)))
  assert.equal(loaded.profiles.worker.id, 'worker')
  assert.equal(loaded.profiles.worker.model, 'qwen3:27b')
  assert.equal(loaded.profiles.worker.persona, 'do the work')
})
