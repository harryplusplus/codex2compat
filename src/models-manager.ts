import { createNamedLog } from './logging.js'
import path from 'node:path'
import fs from 'node:fs/promises'
import { z } from '@hono/zod-openapi'
import {
  ConfigShellToolType,
  ModelsResponse,
  ModelVisibility,
  ReasoningEffort,
  TruncationPolicyConfig,
} from './schemas/models.js'
import stripJsonComments from 'strip-json-comments'
import { just, NOTHING, type Maybe } from './utils.js'

const log = createNamedLog('models-manager')

const BASE_INSTRUCTIONS_PATH = path.join(
  import.meta.dirname,
  '../assets/prompt.md',
)

const ReasoningEffortPresetForFile = z.object({
  effort: ReasoningEffort,
  description: z.string().optional(),
})

const ModelInfoForFile = z.object({
  slug: z.string(),
  display_name: z.string().optional(),
  supported_reasoning_levels: ReasoningEffortPresetForFile.array().default([]),
  shell_type: ConfigShellToolType.default('default'),
  visibility: ModelVisibility.default('list'),
  supported_in_api: z.boolean().default(true),
  priority: z.number().default(1),
  base_instructions: z.string().optional(),
  supports_reasoning_summaries: z.boolean().default(true),
  support_verbosity: z.boolean().default(false),
  truncation_policy: TruncationPolicyConfig.default({
    mode: 'tokens',
    limit: 10_000,
  }),
  supports_parallel_tool_calls: z.boolean().default(true),
  experimental_supported_tools: z.unknown().array().default([]),
})

const ModelsForFile = z.object({ models: ModelInfoForFile.array().default([]) })
type ModelsForFile = z.infer<typeof ModelsForFile>

class BaseInstructions {
  _promise: Promise<string> | null = null

  read(): Promise<string> {
    if (!this._promise) {
      this._promise = fs.readFile(BASE_INSTRUCTIONS_PATH, 'utf8')
    }
    return this._promise
  }
}

async function loadModelsForFile(path: string): Promise<Maybe<ModelsForFile>> {
  try {
    await fs.access(path)
  } catch (err) {
    log('error', () => ({
      message: 'models file not found',
      path,
      error: String(err),
    }))
    return NOTHING
  }

  let content = ''
  try {
    content = await fs.readFile(path, 'utf8')
  } catch (err) {
    log('error', () => ({
      message: 'failed to read models file',
      path,
      error: String(err),
    }))
    return NOTHING
  }

  let obj = {}
  try {
    obj = JSON.parse(stripJsonComments(content, { trailingCommas: true }))
  } catch (err) {
    log('error', () => ({
      message: 'models file has invalid JSON',
      path,
      error: String(err),
    }))
    return NOTHING
  }

  try {
    return just(ModelsForFile.parse(obj))
  } catch (err) {
    log('error', () => ({
      message: 'models file failed schema validation',
      path,
      error: String(err),
    }))
    return NOTHING
  }
}

async function fillModelsForFile(
  modelsForFile: ModelsForFile,
  baseInstructions: BaseInstructions,
): Promise<void> {
  for (const model of modelsForFile.models) {
    if (!model.display_name) {
      model.display_name = model.slug
    }

    for (const reasoningLevel of model.supported_reasoning_levels) {
      if (!reasoningLevel.description) {
        reasoningLevel.description = reasoningLevel.effort
      }
    }

    if (model.base_instructions == null) {
      model.base_instructions = await baseInstructions.read()
    }
  }
}

export class ModelsManager {
  models: ModelsResponse

  constructor(models: ModelsResponse) {
    this.models = models
  }

  static async create(modelsPath: string): Promise<Maybe<ModelsManager>> {
    const [ok, modelsForFile] = await loadModelsForFile(modelsPath)
    if (!ok) {
      return NOTHING
    }

    const baseInstructions = new BaseInstructions()
    await fillModelsForFile(modelsForFile, baseInstructions)

    const models = ModelsResponse.parse(modelsForFile)
    return just(new ModelsManager(models))
  }
}
