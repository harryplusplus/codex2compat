import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'
import { ReasoningEffort } from '../schemas.js'
import type { Context } from '../context.js'

const ImageDetail = z
  .enum(['auto', 'low', 'high', 'original'])
  .openapi('ImageDetail')

const ContentItem = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('input_text'), text: z.string() }),
    z.object({
      type: z.literal('input_image'),
      image_url: z.string(),
      detail: ImageDetail.optional(),
    }),
    z.object({ type: z.literal('output_text'), text: z.string() }),
  ])
  .openapi('ContentItem')

const MessagePhase = z
  .enum(['commentary', 'final_answer'])
  .openapi('MessagePhase')

const ReasoningItemReasoningSummary = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('summary_text'), text: z.string() }),
  ])
  .openapi('ReasoningItemReasoningSummary')

const ReasoningItemContent = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('reasoning_text'), text: z.string() }),
    z.object({ type: z.literal('text'), text: z.string() }),
  ])
  .openapi('ReasoningItemContent')

const LocalShellStatus = z
  .enum(['completed', 'in_progress', 'incomplete'])
  .openapi('LocalShellStatus')

const LocalShellAction = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('exec'),
      command: z.string().array(),
      timeout_ms: z.uint64().nullable(),
      working_directory: z.string().nullable(),
      env: z.record(z.string(), z.string()).nullable(),
      user: z.string().nullable(),
    }),
  ])
  .openapi('LocalShellAction')

const FunctionCallOutputContentItem = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('input_text'), text: z.string() }),
    z.object({
      type: z.literal('input_image'),
      image_url: z.string(),
      detail: ImageDetail.optional(),
    }),
  ])
  .openapi('FunctionCallOutputContentItem')

const FunctionCallOutputBody = z
  .union([z.string(), FunctionCallOutputContentItem.array()])
  .openapi('FunctionCallOutputBody')

const WebSearchAction = z
  .union([
    z.object({
      type: z.literal('search'),
      query: z.string().optional(),
      queries: z.string().array().optional(),
    }),
    z.object({ type: z.literal('open_page'), url: z.string().optional() }),
    z.object({
      type: z.literal('find_in_page'),
      url: z.string().optional(),
      pattern: z.string().optional(),
    }),
    z.object({ type: z.string() }).loose(),
  ])
  .openapi('WebSearchAction')

const ResponseItem = z
  .union([
    z.object({
      type: z.literal('message'),
      role: z.string(),
      content: ContentItem.array(),
      phase: MessagePhase.optional(),
    }),
    z.object({
      type: z.literal('reasoning'),
      summary: ReasoningItemReasoningSummary.array(),
      content: ReasoningItemContent.array().optional(),
      encrypted_content: z.string().nullable(),
    }),
    z.object({
      type: z.literal('local_shell_call'),
      call_id: z.string().nullable(),
      status: LocalShellStatus,
      action: LocalShellAction,
    }),
    z.object({
      type: z.literal('function_call'),
      name: z.string(),
      namespace: z.string().optional(),
      arguments: z.string(),
      call_id: z.string(),
    }),
    z.object({
      type: z.literal('tool_search_call'),
      call_id: z.string().nullable(),
      status: z.string().optional(),
      execution: z.string(),
      arguments: z.unknown(),
    }),
    z.object({
      type: z.literal('function_call_output'),
      call_id: z.string(),
      output: FunctionCallOutputBody,
    }),
    z.object({
      type: z.literal('custom_tool_call'),
      status: z.string().optional(),
      call_id: z.string(),
      name: z.string(),
      input: z.string(),
    }),
    z.object({
      type: z.literal('custom_tool_call_output'),
      call_id: z.string(),
      name: z.string().optional(),
      output: FunctionCallOutputBody,
    }),
    z.object({
      type: z.literal('tool_search_output'),
      call_id: z.string().nullable(),
      status: z.string(),
      execution: z.string(),
      tools: z.unknown().array(),
    }),
    z.object({
      type: z.literal('web_search_call'),
      status: z.string().optional(),
      action: WebSearchAction.optional(),
    }),
    z.object({
      type: z.literal('image_generation_call'),
      status: z.string(),
      revised_prompt: z.string().optional(),
      result: z.string(),
    }),
    z.object({ type: z.literal('compaction'), encrypted_content: z.string() }),
    z.object({
      type: z.literal('compaction_summary'),
      encrypted_content: z.string(),
    }),
    z.object({
      type: z.literal('context_compaction'),
      encrypted_content: z.string().optional(),
    }),
    z.object({ type: z.string() }).loose(),
  ])
  .openapi('ResponseItem')

const ReasoningSummary = z
  .enum(['auto', 'concise', 'detailed', 'none'])
  .openapi('ReasoningSummary')

const Reasoning = z
  .object({
    effort: ReasoningEffort.optional(),
    summary: ReasoningSummary.optional(),
  })
  .openapi('Reasoning')

const OpenAiVerbosity = z
  .enum(['low', 'medium', 'high'])
  .openapi('OpenAiVerbosity')

const TextFormatType = z.enum(['json_schema']).openapi('TextFormatType')

const TextFormat = z
  .object({
    type: TextFormatType,
    strict: z.boolean(),
    schema: z.unknown(),
    name: z.string(),
  })
  .openapi('TextFormat')

const TextControls = z
  .object({
    verbosity: OpenAiVerbosity.optional(),
    format: TextFormat.optional(),
  })
  .openapi('TextControls')

const ResponsesApiRequest = z
  .object({
    model: z.string(),
    instructions: z.string().optional(),
    input: ResponseItem.array(),
    tools: z.unknown().array(),
    tool_choice: z.string(),
    parallel_tool_calls: z.boolean(),
    reasoning: Reasoning.nullable(),
    store: z.boolean(),
    stream: z.boolean(),
    include: z.string().array(),
    service_tier: z.string().optional(),
    prompt_cache_key: z.string().optional(),
    text: TextControls.optional(),
    client_metadata: z.record(z.string(), z.string()).optional(),
  })
  .openapi('ResponsesApiRequest')

const postResponses = createRoute({
  method: 'post',
  path: '/responses',
  request: {
    body: {
      content: { 'application/json': { schema: ResponsesApiRequest } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'SSE event stream',
      content: { 'text/event-stream': { schema: z.any() } },
    },
  },
})

export function registerResponses(app: OpenAPIHono, context: Context): void {
  app.openapi(postResponses, async c => {
    return streamSSE(c, async stream => {
      const body = c.req.valid('json')
      throw new Error('TODO')
    })
  })
}
