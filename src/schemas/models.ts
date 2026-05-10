import { z } from '@hono/zod-openapi'

export const ReasoningEffort = z
  .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
  .openapi('ReasoningEffort')

export const ConfigShellToolType = z
  .enum(['default', 'local', 'unified_exec', 'disabled', 'shell_command'])
  .openapi('ConfigShellToolType')

export const ModelVisibility = z
  .enum(['list', 'hide', 'none'])
  .openapi('ModelVisibility')

export const TruncationMode = z
  .enum(['bytes', 'tokens'])
  .openapi('TruncationMode')

export const TruncationPolicyConfig = z
  .object({ mode: TruncationMode, limit: z.number() })
  .openapi('TruncationPolicyConfig')

const ReasoningEffortPreset = z
  .object({ effort: ReasoningEffort, description: z.string() })
  .openapi('ReasoningEffortPreset')

const ModelInfo = z
  .object({
    slug: z.string(),
    display_name: z.string(),
    supported_reasoning_levels: ReasoningEffortPreset.array(),
    shell_type: ConfigShellToolType,
    visibility: ModelVisibility,
    supported_in_api: z.boolean(),
    priority: z.number(),
    base_instructions: z.string(),
    supports_reasoning_summaries: z.boolean(),
    support_verbosity: z.boolean(),
    truncation_policy: TruncationPolicyConfig,
    supports_parallel_tool_calls: z.boolean(),
    experimental_supported_tools: z.unknown().array(),
  })
  .openapi('ModelInfo')

export const ModelsResponse = z
  .object({ models: ModelInfo.array() })
  .openapi('ModelsResponse')
export type ModelsResponse = z.infer<typeof ModelsResponse>
