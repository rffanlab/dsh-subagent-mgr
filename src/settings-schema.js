import z from '@deepseek-ai/schemastery'

export const MANAGER_SETTINGS_VERSION = 1

const ProfileSettingsSchema = z.object({
  id: z.string().required(),
  enabled: z.boolean().required(),
  backend: z.string().required(),
  toolName: z.string().required(),
  llmProvider: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  dynamicModelSelection: z.boolean().required(),
  enableRunInBackground: z.boolean().required(),
  backgroundMode: z.union(['one-shot', 'continuable']).required(),
  persona: z.string(),
  allowTools: z.array(z.string()),
  denyTools: z.array(z.string()),
  maxDepth: z.union([
    z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER),
    z.string(),
  ]).required(),
})

export const ManagerSettingsSchema = z.object({
  schemaVersion: z.number().step(1).min(1).default(MANAGER_SETTINGS_VERSION),
  profiles: z.dict(ProfileSettingsSchema).default({}),
  migratedLegacy: z.boolean().default(false),
})
