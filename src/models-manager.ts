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
import { NONE, some, type Option } from './utils.js'

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
  _content: string | Promise<string> | null = null

  read(): Promise<string> {
    if (typeof this._content === 'string') {
      return Promise.resolve(this._content)
    }

    if (this._content !== null) {
      return this._content
    }

    const promise = fs.readFile(BASE_INSTRUCTIONS_PATH, 'utf8').then(v => {
      this._content = v
      return v
    })

    this._content = promise
    return promise
  }
}

async function loadModelsForFile(path: string): Promise<Option<ModelsForFile>> {
  try {
    await fs.access(path)
  } catch (err) {
    log('error', () => ({
      message: 'models file not found',
      path,
      error: String(err),
    }))
    return NONE
  }

  const [readOk, content] = await fs
    .readFile(path, 'utf8')
    .then(v => some(v))
    .catch(err => {
      log('error', () => ({
        message: 'failed to read models file',
        path,
        error: String(err),
      }))
      return NONE
    })
  if (!readOk) {
    return NONE
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
    return NONE
  }

  try {
    return some(ModelsForFile.parse(obj))
  } catch (err) {
    log('error', () => ({
      message: 'models file failed schema validation',
      path,
      error: String(err),
    }))
    return NONE
  }
}

async function fillModelsForFile(
  models: ModelsForFile,
  baseInstructions: BaseInstructions,
): Promise<boolean> {
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
      model.base_instructions = await baseInstructions.read()
    }
  }

  return true
}

export class ModelsManager {
  _baseInstructions = new BaseInstructions()

  _models: ModelsResponse | null = null
  get models(): ModelsResponse {
    if (!this._models) {
      throw new Error('ModelsManager not initialized — call init() first')
    }

    return this._models
  }

  async init(modelsPath: string): Promise<boolean> {
    const [loaded, modelsJson] = await loadModelsForFile(modelsPath)
    if (!loaded) {
      return false
    }

    if (!(await fillModelsForFile(modelsJson, this._baseInstructions))) {
      return false
    }

    this._models = ModelsResponse.parse(modelsJson)
    return true
  }
}
