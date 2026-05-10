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
} from './schemas.js'
import stripJsonComments from 'strip-json-comments'

const log = createNamedLog('models-manager')

const BASE_INSTRUCTIONS_PATH = path.join(
  import.meta.dirname,
  '../assets/prompt.md',
)

const ReasoningEffortPreset = z.object({
  effort: ReasoningEffort,
  description: z.string().optional(),
})

const ModelInfo = z.object({
  slug: z.string(),
  display_name: z.string().optional(),
  supported_reasoning_levels: ReasoningEffortPreset.array().default([]),
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

const ModelsJson = z.object({ models: ModelInfo.array().default([]) })
type ModelsJson = z.infer<typeof ModelsJson>

async function loadBaseInstructions(): Promise<string> {
  return await fs.readFile(BASE_INSTRUCTIONS_PATH, 'utf8')
}

async function loadModelsJson(
  path: string,
): Promise<[true, ModelsJson] | [false, null]> {
  try {
    await fs.access(path)
  } catch (err) {
    log('error', () => ({
      message: 'models file not found',
      path,
      error: String(err),
    }))
    return [false, null]
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
    return [false, null]
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
    return [false, null]
  }

  try {
    return [true, ModelsJson.parse(obj)]
  } catch (err) {
    log('error', () => ({
      message: 'models file failed schema validation',
      path,
      error: String(err),
    }))
    return [false, null]
  }
}

export class ModelsManager {
  _baseInstructions: string | null = null

  _models: ModelsResponse | null = null
  get models(): ModelsResponse {
    if (!this._models) {
      throw new Error('ModelsManager not initialized — call init() first')
    }

    return this._models
  }

  async init(modelsPath: string): Promise<boolean> {
    const [success, modelsJson] = await loadModelsJson(modelsPath)
    if (!success) {
      return false
    }

    if (!(await this._fillModels(modelsJson))) {
      return false
    }

    this._models = ModelsResponse.parse(modelsJson)
    return true
  }

  async _fillModels(models: ModelsJson): Promise<boolean> {
    for (const model of models.models) {
      if (!model.display_name) {
        model.display_name = model.slug
      }

      for (const reasoningLevel of model.supported_reasoning_levels) {
        if (!reasoningLevel.description) {
          reasoningLevel.description = reasoningLevel.effort
        }
      }

      if (!model.base_instructions) {
        if (!this._baseInstructions) {
          this._baseInstructions = await loadBaseInstructions()
        }

        model.base_instructions = this._baseInstructions
      }
    }

    return true
  }
}
