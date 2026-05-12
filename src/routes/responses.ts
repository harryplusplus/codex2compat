import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'
import { createNamedLog } from '../logging.js'
import type { Context } from '../context.js'

// ---------------------------------------------------------------------------
// Zod schemas (OpenAPI)
// ---------------------------------------------------------------------------

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

const ReasoningEffort = z
  .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
  .openapi('ReasoningEffort')

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

type ResponsesApiRequest = z.infer<typeof ResponsesApiRequest>
type ResponseItemT = z.infer<typeof ResponseItem>
type ContentItemT = z.infer<typeof ContentItem>

// ---------------------------------------------------------------------------
// OpenAI Chat Completions types (internal, not exposed to OpenAPI)
// ---------------------------------------------------------------------------

type OpenAiChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OpenAiContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

type OpenAiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } }

type OpenAiTool = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: unknown
    strict?: boolean
  }
}

type OpenAiToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OpenAiChunk = {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: {
    index: number
    delta: {
      role?: string
      content?: string | null
      tool_calls?: {
        index: number
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string }
      }[]
    }
    finish_reason?: string | null
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: { cached_tokens?: number }
    completion_tokens_details?: { reasoning_tokens?: number }
  } | null
  'x-request-id'?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const log = createNamedLog('routes.responses')

function generateResponseId(): string {
  // OpenAI Responses API format: resp_ + 50 hex chars (25 random bytes)
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(25)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `resp_${hex}`
}

function generateItemId(prefix: string = 'msg'): string {
  // OpenAI Responses API format: prefix + 50 hex chars (25 random bytes)
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(25)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}_${hex}`
}

function generateCallId(): string {
  // Codex CLI format: call_ + base64url(18 bytes) = 29 chars
  const buf = crypto.getRandomValues(new Uint8Array(18))
  const b64 = Buffer.from(buf).toString('base64url').replace(/=+$/, '')
  return `call_${b64}`
}

// ---------------------------------------------------------------------------
// Request translation: ResponsesApiRequest → Chat Completions request
// ---------------------------------------------------------------------------

function toChatMessages(input: ResponseItemT[]): OpenAiChatMessage[] {
  const messages: OpenAiChatMessage[] = []

  for (const item of input) {
    switch (item.type) {
      case 'message': {
        const role = item.role as string
        const content = item.content as ContentItemT[]
        if (role === 'system') {
          const text = content
            .filter(c => c.type === 'input_text')
            .map(c => c.text)
            .join('\n')
          messages.push({ role: 'system', content: text })
        } else if (role === 'user') {
          const parts = content.map(toContentPart).filter(Boolean)
          if (parts.length === 1 && parts[0]?.type === 'text') {
            messages.push({ role: 'user', content: parts[0].text })
          } else {
            messages.push({
              role: 'user',
              content: parts as OpenAiContentPart[],
            })
          }
        } else if (role === 'assistant') {
          const text = content
            .filter(c => c.type === 'output_text')
            .map(c => c.text)
            .join('')
          messages.push({ role: 'assistant', content: text || null })
        }
        break
      }

      case 'function_call_output': {
        const item2 = item as {
          type: 'function_call_output'
          call_id: string
          output: string | { type: string; text: string }[]
        }
        const outputText =
          typeof item2.output === 'string'
            ? item2.output
            : item2.output
                .filter(c => c.type === 'input_text')
                .map(c => c.text)
                .join('\n')
        messages.push({
          role: 'tool',
          content: outputText,
          tool_call_id: item2.call_id,
        })
        break
      }

      case 'custom_tool_call_output': {
        const item2 = item as {
          type: 'custom_tool_call_output'
          call_id: string
          output: string | { type: string; text: string }[]
        }
        const outputText =
          typeof item2.output === 'string'
            ? item2.output
            : item2.output
                .filter(c => c.type === 'input_text')
                .map(c => c.text)
                .join('\n')
        messages.push({
          role: 'tool',
          content: outputText,
          tool_call_id: item2.call_id,
        })
        break
      }

      case 'function_call': {
        const item2 = item as {
          type: 'function_call'
          call_id: string
          name: string
          arguments: string
        }
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: item2.call_id,
              type: 'function',
              function: { name: item2.name, arguments: item2.arguments },
            },
          ],
        })
        break
      }

      case 'reasoning':
      case 'web_search_call':
      case 'tool_search_call':
      case 'tool_search_output':
      case 'local_shell_call':
      case 'custom_tool_call':
      case 'image_generation_call':
      case 'compaction':
      case 'compaction_summary':
      case 'context_compaction':
        // Skip — not sent to chat completions
        break

      default:
        // Loose catch-all for unknown types
        break
    }
  }

  return messages
}

function toContentPart(c: ContentItemT): OpenAiContentPart | null {
  switch (c.type) {
    case 'input_text':
      return { type: 'text', text: c.text }
    case 'input_image':
      return {
        type: 'image_url',
        image_url: { url: c.image_url, detail: c.detail },
      }
    case 'output_text':
      return null // shouldn't be in input
  }
}

function convertTools(tools: unknown[]): OpenAiTool[] {
  const result: OpenAiTool[] = []
  for (const tool of tools) {
    if (isRecord(tool) && tool.type === 'function' && isRecord(tool.function)) {
      result.push({
        type: 'function',
        function: {
          name: (tool.function.name ?? '') as string,
          description:
            typeof tool.function.description === 'string'
              ? tool.function.description
              : undefined,
          parameters: tool.function.parameters ?? {},
          strict:
            typeof tool.function.strict === 'boolean'
              ? tool.function.strict
              : undefined,
        },
      })
    }
  }
  return result
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

// ---------------------------------------------------------------------------
// SSE emission helpers
// ---------------------------------------------------------------------------

function sseEvent(
  event: string,
  data: unknown,
): { event: string; data: string } {
  return { event, data: JSON.stringify(data) }
}

function emitCreated(responseId: string, model?: string) {
  const seq = nextSseSeq()
  const ev = sseEvent('response.created', {
    response: {
      id: responseId,
      ...(model ? { headers: { 'OpenAI-Model': model } } : {}),
    },
    type: 'response.created',
  })
  log('debug', () => ({
    message: 'sse > created',
    seq,
    response_id: responseId,
    model: model ?? null,
  }))
  return ev
}

let _sseSeq = 0
function nextSseSeq(): number {
  return ++_sseSeq
}

function emitOutputItemAdded(item: ResponseItemT, itemId: string) {
  const seq = nextSseSeq()
  const ev = sseEvent('response.output_item.added', {
    type: 'response.output_item.added',
    item: { ...item, id: itemId },
  })
  log('debug', () => ({
    message: 'sse > output_item.added',
    seq,
    item_type: (item as Record<string, unknown>).type as string,
    item_id: itemId,
  }))
  return ev
}

function emitOutputItemDone(item: ResponseItemT, itemId: string) {
  const seq = nextSseSeq()
  const ev = sseEvent('response.output_item.done', {
    type: 'response.output_item.done',
    item: { ...item, id: itemId },
  })
  const itemObj = item as Record<string, unknown>
  log('debug', () => ({
    message: 'sse > output_item.done',
    seq,
    item_type: itemObj.type as string,
    item_id: itemId,
    call_id: (itemObj.call_id as string) ?? null,
  }))
  return ev
}

function emitOutputTextDelta(itemId: string, delta: string) {
  const seq = nextSseSeq()
  const ev = sseEvent('response.output_text.delta', {
    type: 'response.output_text.delta',
    item_id: itemId,
    delta,
  })
  log('debug', () => ({
    message: 'sse > output_text.delta',
    seq,
    item_id: itemId,
    delta_len: delta.length,
  }))
  return ev
}

function emitFunctionCallArgumentsDelta(
  itemId: string,
  callId: string,
  delta: string,
) {
  const seq = nextSseSeq()
  const ev = sseEvent('response.function_call_arguments.delta', {
    type: 'response.function_call_arguments.delta',
    item_id: itemId,
    call_id: callId,
    delta,
  })
  log('debug', () => ({
    message: 'sse > function_call_arguments.delta',
    seq,
    item_id: itemId,
    call_id: callId,
    delta_len: delta.length,
  }))
  return ev
}

function emitCompleted(
  responseId: string,
  usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
    cached_input_tokens?: number
    reasoning_output_tokens?: number
  },
) {
  const seq = nextSseSeq()
  const resp: Record<string, unknown> = { id: responseId }
  if (usage) {
    resp.usage = {
      input_tokens: usage.input_tokens,
      input_tokens_details: usage.cached_input_tokens
        ? { cached_tokens: usage.cached_input_tokens }
        : null,
      output_tokens: usage.output_tokens,
      output_tokens_details: usage.reasoning_output_tokens
        ? { reasoning_tokens: usage.reasoning_output_tokens }
        : null,
      total_tokens: usage.total_tokens,
    }
  }
  const ev = sseEvent('response.completed', {
    type: 'response.completed',
    response: resp,
  })
  log('debug', () => ({
    message: 'sse > completed',
    seq,
    response_id: responseId,
    has_usage: !!usage,
  }))
  return ev
}

function emitFailed(code: string, message: string) {
  const seq = nextSseSeq()
  const ev = sseEvent('response.failed', {
    type: 'response.failed',
    response: {
      id: generateResponseId(),
      status: 'failed',
      error: { code, message },
    },
  })
  log('debug', () => ({ message: 'sse > failed', seq, code }))
  return ev
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

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
    const body = c.req.valid('json')
    const { config, signal } = context

    return streamSSE(c, async stream => {
      // Abort the stream if the server is shutting down
      const abortListener = () => stream.abort()
      signal.addEventListener('abort', abortListener, { once: true })
      try {
        await handleRequest(stream, body, config, signal)
      } finally {
        signal.removeEventListener('abort', abortListener)
      }
    })
  })
}

async function handleRequest(
  stream: SSEStreamController,
  body: ResponsesApiRequest,
  config: { baseUrl: string; apiKey?: string },
  signal: AbortSignal,
): Promise<void> {
  const responseId = generateResponseId()

  // 1. Translate request
  const messages = toChatMessages(body.input)
  const tools = convertTools(body.tools)

  if (body.instructions) {
    messages.unshift({ role: 'system', content: body.instructions })
  }

  // 2. Build the upstream request
  const chatUrl = config.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const chatBody: Record<string, unknown> = {
    model: body.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  }

  if (tools.length > 0) {
    chatBody.tools = tools
    chatBody.tool_choice = body.tool_choice
    chatBody.parallel_tool_calls = body.parallel_tool_calls
  }

  log('debug', () => ({
    message: 'forwarding to upstream',
    url: chatUrl,
    model: body.model,
    message_count: messages.length,
    tool_count: tools.length,
    response_id: responseId,
  }))

  // 3. Fetch upstream SSE stream
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(chatBody),
      signal,
    })
  } catch (err) {
    log('error', () => ({
      message: 'upstream fetch failed',
      error: String(err),
    }))
    await stream.writeSSE(emitFailed('upstream_error', String(err)))
    return
  }

  if (!upstreamResponse.ok) {
    const errorText = await upstreamResponse.text().catch(() => 'unknown')
    log('error', () => ({
      message: 'upstream returned error',
      status: upstreamResponse.status,
      body: errorText,
    }))
    await stream.writeSSE(
      emitFailed(
        'upstream_error',
        `HTTP ${upstreamResponse.status}: ${errorText}`,
      ),
    )
    return
  }

  if (!upstreamResponse.body) {
    await stream.writeSSE(emitFailed('upstream_error', 'empty response body'))
    return
  }

  // 4. Emit response.created
  await stream.writeSSE(emitCreated(responseId))

  // 5. Process upstream SSE stream
  const reader = upstreamResponse.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  let currentItemId: string | null = null
  let accumulatedContent = ''
  let accumulatedToolCalls: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map()
  let hasContent = false
  let hasToolCalls = false

  let finalUsage:
    | {
        input_tokens: number
        output_tokens: number
        total_tokens: number
        cached_input_tokens?: number
        reasoning_output_tokens?: number
      }
    | undefined

  function startNewMessage() {
    currentItemId = generateItemId('msg')
    accumulatedContent = ''
    accumulatedToolCalls = new Map()
    hasContent = false
    hasToolCalls = false
  }

  function ensureMessageItem() {
    if (!currentItemId) {
      currentItemId = generateItemId('msg')
    }
  }

  async function flushCurrentItem() {
    if (!currentItemId) return
    log('debug', () => ({
      message: 'flush item',
      item_id: currentItemId,
      has_content: hasContent,
      content_len: accumulatedContent.length,
      has_tool_calls: hasToolCalls,
      tool_call_count: accumulatedToolCalls.size,
    }))

    if (hasContent) {
      const item: ResponseItemT = {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text' as const, text: accumulatedContent }],
      }
      await stream.writeSSE(emitOutputItemDone(item, currentItemId))
    }

    if (hasToolCalls && accumulatedToolCalls.size > 0) {
      for (const [, tc] of accumulatedToolCalls) {
        log('debug', () => ({
          message: 'flush tool_call item',
          call_id: tc.id,
          name: tc.name,
          args: tc.arguments,
        }))
        const item: ResponseItemT = {
          type: 'function_call',
          name: tc.name,
          arguments: tc.arguments,
          call_id: tc.id,
        }
        const tcItemId = generateItemId('fc')
        await stream.writeSSE(emitOutputItemAdded(item, tcItemId))
        await stream.writeSSE(emitOutputItemDone(item, tcItemId))
      }
    }

    currentItemId = null
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()

        if (data === '[DONE]') continue

        let chunk: OpenAiChunk
        try {
          chunk = JSON.parse(data) as OpenAiChunk
        } catch {
          continue
        }

        log('debug', () => ({
          message: 'upstream chunk',
          id: chunk.id,
          model: chunk.model,
          choices: chunk.choices.map(c => ({
            index: c.index,
            finish_reason: c.finish_reason ?? null,
            content_len: c.delta.content?.length ?? 0,
            tool_calls:
              c.delta.tool_calls?.map(tc => ({
                index: tc.index,
                id: tc.id ?? null,
                name: tc.function?.name ?? null,
                args_len: tc.function?.arguments?.length ?? 0,
              })) ?? null,
          })),
          has_usage: !!chunk.usage,
        }))

        // Check for usage in final chunk
        if (chunk.usage) {
          const u = chunk.usage
          finalUsage = {
            input_tokens: u.prompt_tokens,
            output_tokens: u.completion_tokens,
            total_tokens: u.total_tokens,
            cached_input_tokens: u.prompt_tokens_details?.cached_tokens,
            reasoning_output_tokens:
              u.completion_tokens_details?.reasoning_tokens,
          }
        }

        for (const choice of chunk.choices) {
          const delta = choice.delta

          // Content delta
          if (delta.content != null) {
            if (!currentItemId) {
              startNewMessage()
              const item: ResponseItemT = {
                type: 'message',
                role: 'assistant',
                content: [],
              }
              await stream.writeSSE(emitOutputItemAdded(item, currentItemId!))
            }
            accumulatedContent += delta.content
            hasContent = true
            await stream.writeSSE(
              emitOutputTextDelta(currentItemId!, delta.content),
            )
          }

          // Tool call deltas
          if (delta.tool_calls) {
            for (const tcDelta of delta.tool_calls) {
              const idx = tcDelta.index

              // Initialize or reuse tool call accumulator
              if (!accumulatedToolCalls.has(idx)) {
                const fallbackId = tcDelta.id ?? generateCallId()
                accumulatedToolCalls.set(idx, {
                  id: fallbackId,
                  name: '',
                  arguments: '',
                })
              }

              const tc = accumulatedToolCalls.get(idx)!

              // Update id from upstream (first chunk has id, subsequent are null)
              if (tcDelta.id) {
                tc.id = tcDelta.id
                log('debug', () => ({
                  message: 'tool_call init',
                  index: idx,
                  upstream_id: tcDelta.id ?? null,
                  name_start: tcDelta.function?.name ?? null,
                }))
              }

              let nameChange = 0
              let argsChange = 0
              if (tcDelta.function?.name) {
                nameChange = tcDelta.function.name.length
                tc.name += tcDelta.function.name
              }
              if (tcDelta.function?.arguments) {
                argsChange = tcDelta.function.arguments.length
                tc.arguments += tcDelta.function.arguments
              }

              hasToolCalls = true
              ensureMessageItem()

              // Emit function_call_arguments.delta for each tool call
              // Note: Codex CLI ignores this event (no handler in process_responses_event)
              const tcItemId = generateItemId('fc')
              if (tcDelta.function?.arguments) {
                await stream.writeSSE(
                  emitFunctionCallArgumentsDelta(
                    tcItemId,
                    tc.id,
                    tcDelta.function.arguments,
                  ),
                )
              }

              log('debug', () => ({
                message: 'tool_call accumulated',
                index: idx,
                current_id: tc.id,
                current_name_len: tc.name.length,
                current_args_len: tc.arguments.length,
                name_delta: nameChange,
                args_delta: argsChange,
                new_item_id: tcItemId,
              }))
            }
          }

          // Finish reason
          if (choice.finish_reason != null) {
            await flushCurrentItem()
          }
        }
      }
    }

    // If there's unflushed content (stream ended without a finish_reason chunk)
    await flushCurrentItem()

    // 6. Emit response.completed
    await stream.writeSSE(emitCompleted(responseId, finalUsage))
  } catch (err) {
    if (signal.aborted) {
      log('debug', () => ({ message: 'stream aborted' }))
      return
    }
    log('error', () => ({
      message: 'stream processing error',
      error: String(err),
    }))
    try {
      await stream.writeSSE(emitFailed('stream_error', String(err)))
    } catch {
      // stream may already be closed
    }
  }
}

// ---------------------------------------------------------------------------
// Stream controller interface (from hono streamSSE)
// ---------------------------------------------------------------------------

type SSEStreamController = {
  writeSSE: (event: { event: string; data: string }) => Promise<void>
  abort: () => void
}
