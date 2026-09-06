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
  if (missing.length) {
    throw new Error(`${path}: upstream contract changed; missing markers: ${missing.join(', ')}`)
  }
  console.log(`ok ${path}: ${tokens.join(', ')}`)
}

const toolSubagentPath = 'packages/subagent/tool-subagent/src/index.ts'
const settingsScopePath = 'packages/client/ui-settings/src/client/settings-scope.ts'
const clientBundlePath = 'packages/client/tsdown.client.ts'
const pluginCliPath = 'apps/cli/src/plugin.ts'

const [toolSubagent, settingsScope, clientBundle, pluginCli] = await Promise.all([
  source(toolSubagentPath),
  source(settingsScopePath),
  source(clientBundlePath),
  source(pluginCliPath),
])

requireTokens(toolSubagentPath, toolSubagent, [
  'modelSelectionSettings',
  'enableRunInBackground',
  'backgroundMode',
  'agentOptions',
  'persona',
  'toolFilter',
  'maxDepth',
])
requireTokens(settingsScopePath, settingsScope, ['mutate(ops', 'expectedRevision'])
requireTokens(clientBundlePath, clientBundle, ['__ModuleLoader__.load'])
requireTokens(pluginCliPath, pluginCli, ['dsh.bundle', 'reconcilePlugins'])

console.log('DeepSeek Harness upstream contracts used by dsh-subagent-mgr are present.')
