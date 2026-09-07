import test from 'node:test'
import assert from 'node:assert/strict'
import { formatRouteAdvice, rankSubagents } from '../src/routing-score.js'

const profiles = {
  local_worker: {
    id:'local_worker', enabled:true, backend:'spawn', toolName:'sub_local',
    llmProvider:'ollama', model:'qwen-27b', enableRunInBackground:true,
    persona:'coding bulk implementation tests 重复编码 批处理 测试',
  },
  strong_reviewer: {
    id:'strong_reviewer', enabled:true, backend:'codex', toolName:'sub_strong',
    enableRunInBackground:true,
    persona:'coding architecture review difficult debugging 代码审查 架构 调试',
  },
  researcher: {
    id:'researcher', enabled:true, backend:'spawn', toolName:'sub_research',
    llmProvider:'remote', model:'research-model', enableRunInBackground:false,
    persona:'research web documentation sources 调研 文档 搜索 资料',
  },
}

const telemetry = {
  workers: [
    { id:'local_worker', calls:20, successes:16, failures:4, running:0, avgDurationMs:10_000, lastOutcome:'success', lastRoute:'ollama/qwen-27b' },
    { id:'strong_reviewer', calls:20, successes:19, failures:1, running:0, avgDurationMs:60_000, lastOutcome:'success', lastRoute:'codex-default' },
    { id:'researcher', calls:12, successes:11, failures:1, running:0, avgDurationMs:25_000, lastOutcome:'success', lastRoute:'remote/research-model' },
  ],
  recent: [],
}

test('cheap routing prefers a known-local worker while quality prefers stronger evidence', () => {
  const cheap = rankSubagents(profiles, telemetry, { goal:'cheap', task:'implement coding tests', tags:'coding,tests' })
  assert.equal(cheap.ranked[0].id, 'local_worker')
  assert.equal(cheap.ranked[0].costLabel, 'known-local route')

  const quality = rankSubagents(profiles, telemetry, { goal:'quality', task:'architecture coding review', tags:'coding,review' })
  assert.equal(quality.ranked[0].id, 'strong_reviewer')
  assert.ok(quality.ranked[0].reliability > cheap.ranked.find(row => row.id === 'local_worker').reliability)
})

test('task/persona lexical fit can route research work to the research worker', () => {
  const result = rankSubagents(profiles, telemetry, {
    goal:'balanced',
    task:'research documentation and web sources 调研 文档 搜索',
    tags:'research,documentation,调研,文档',
  })
  assert.equal(result.ranked[0].id, 'researcher')
  assert.ok(result.ranked[0].skillScore > result.ranked.find(row => row.id === 'local_worker').skillScore)
})

test('background requirement excludes workers that cannot run in background', () => {
  const result = rankSubagents(profiles, telemetry, { background:true, goal:'balanced', limit:10 })
  assert.equal(result.ranked.some(row => row.id === 'researcher'), false)
  assert.equal(result.candidateCount, 2)
})

test('running load reduces the otherwise identical candidate score', () => {
  const equalProfiles = {
    a:{ id:'a', enabled:true, backend:'spawn', toolName:'sub_a', persona:'coding' },
    b:{ id:'b', enabled:true, backend:'spawn', toolName:'sub_b', persona:'coding' },
  }
  const result = rankSubagents(equalProfiles, {
    workers:[
      { id:'a', calls:10, successes:9, failures:1, running:3, avgDurationMs:20_000 },
      { id:'b', calls:10, successes:9, failures:1, running:0, avgDurationMs:20_000 },
    ],
    recent:[],
  }, { goal:'speed', task:'coding' })
  assert.equal(result.ranked[0].id, 'b')
  assert.ok(result.ranked[0].loadScore > result.ranked[1].loadScore)
})

test('cold workers use a Bayesian prior instead of perfect or zero reliability', () => {
  const result = rankSubagents({
    cold:{ id:'cold', enabled:true, backend:'spawn', toolName:'sub_cold' },
  }, { workers:[], recent:[] }, {})
  assert.equal(result.ranked[0].confidence, 'cold')
  assert.ok(result.ranked[0].reliability > 0.5 && result.ranked[0].reliability < 1)
})

test('route advice explicitly says it is advisory and does not dispatch', () => {
  const result = rankSubagents(profiles, telemetry, { goal:'balanced', limit:2 })
  const text = formatRouteAdvice(result)
  assert.match(text, /advisory only; no task was executed/)
  assert.match(text, /never delegates, retries, or repeats side effects/)
  assert.match(text, /tool=sub_/)
})

test('invalid goal and limit fail closed', () => {
  assert.throws(() => rankSubagents(profiles, telemetry, { goal:'free-money' }), /goal must be one of/)
  assert.throws(() => rankSubagents(profiles, telemetry, { limit:0 }), /limit must be an integer/)
})
