import test from 'node:test'
import assert from 'node:assert/strict'
import { backendHint, hintedCompatibilityProblems } from '../src/backend-hints.js'

test('official backend hints match intended control-plane behavior', () => {
  assert.equal(backendHint('spawn').continuable, true)
  assert.equal(backendHint('fork').persona, true)
  assert.equal(backendHint('dsh-sdk').agentOptions, true)
  assert.equal(backendHint('dsh-sdk').persona, false)
  assert.equal(backendHint('codex').agentOptions, false)
  assert.equal(backendHint('claude-code').toolFilter, false)
  assert.equal(backendHint('acp').depthLimit, false)
  assert.equal(backendHint('custom'), undefined)
})

test('known unsupported combinations are rejected before a provider is mounted', () => {
  const problems = hintedCompatibilityProblems({
    backend: 'codex',
    llmProvider: 'openai',
    model: 'gpt',
    dynamicModelSelection: true,
    persona: 'worker',
    allowTools: ['grep'],
    maxDepth: 2,
    backgroundMode: 'continuable',
  })
  assert.ok(problems.some(value => value.includes('agentOptions')))
  assert.ok(problems.some(value => value.includes('persona')))
  assert.ok(problems.some(value => value.includes('tool filters')))
  assert.ok(problems.some(value => value.includes('maxDepth')))
  assert.ok(problems.some(value => value.includes('continuable')))
})

test('custom providers receive no speculative restrictions', () => {
  assert.deepEqual(hintedCompatibilityProblems({
    backend: 'my-backend',
    llmProvider: 'local',
    model: 'm',
    dynamicModelSelection: true,
    persona: 'worker',
    allowTools: ['grep'],
    maxDepth: 2,
    backgroundMode: 'continuable',
  }), [])
})
