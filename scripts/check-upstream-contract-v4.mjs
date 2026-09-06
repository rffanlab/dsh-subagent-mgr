const ROOT = 'https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master'

async function source(path) {
  const response = await fetch(`${ROOT}/${path}`, {
    headers: { 'user-agent': 'dsh-subagent-mgr-upstream-contract' },
  })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.text()
}

function requireTokens(path, text, tokens) {
  const missing = tokens.filter(token => !text.includes(token))
  if (missing.length) throw new Error(`${path}: upstream contract changed; missing markers: ${missing.join(', ')}`)
  console.log(`ok ${path}: ${tokens.join(', ')}`)
}

function rejectTokens(path, text, tokens) {
  const present = tokens.filter(token => text.includes(token))
  if (present.length) throw new Error(`${path}: upstream capability changed; now contains: ${present.join(', ')}`)
}

const paths = {
  tool: 'packages/subagent/tool-subagent/src/index.ts',
  settings: 'packages/client/ui-settings/src/client/settings-scope.ts',
  client: 'packages/client/tsdown.client.ts',
  pluginCli: 'apps/cli/src/plugin.ts',
  spawn: 'packages/subagent/subagent-spawn-in-process/src/index.ts',
  fork: 'packages/subagent/subagent-fork-in-process/src/index.ts',
  sdk: 'packages/subagent/subagent-dsh-sdk/src/index.ts',
  codex: 'packages/subagent/subagent-codex/src/index.ts',
  claude: 'packages/subagent/subagent-claude-code/src/index.ts',
  acp: 'packages/subagent/subagent-acp/src/index.ts',
}

const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await source(path)]))
const text = Object.fromEntries(entries)

requireTokens(paths.tool, text.tool, [
  'modelSelectionSettings', 'enableRunInBackground', 'backgroundMode',
  'agentOptions', 'persona', 'toolFilter', 'maxDepth',
])
requireTokens(paths.settings, text.settings, ['mutate(ops', 'expectedRevision'])
requireTokens(paths.client, text.client, ['__ModuleLoader__.load'])
requireTokens(paths.pluginCli, text.pluginCli, ['dsh.bundle', 'reconcilePlugins'])

for (const key of ['spawn', 'fork']) {
  requireTokens(paths[key], text[key], [
    'agentOptions: true', 'depthLimit: true', 'toolFilter: true', 'persona: true',
    'prepareContinuable',
  ])
}
requireTokens(paths.sdk, text.sdk, ['...NO_START_CAPABILITIES', 'agentOptions: true'])
rejectTokens(paths.sdk, text.sdk, ['prepareContinuable('])

for (const key of ['codex', 'claude']) {
  requireTokens(paths[key], text[key], ['capabilities: SubagentCapabilities = NO_START_CAPABILITIES'])
  rejectTokens(paths[key], text[key], ['prepareContinuable('])
}
requireTokens(paths.acp, text.acp, [
  'agentOptions: false', 'depthLimit: false', 'toolFilter: false', 'persona: false',
])
rejectTokens(paths.acp, text.acp, ['prepareContinuable('])

console.log('DeepSeek Harness contracts and official backend capability hints still match dsh-subagent-mgr.')
