# codex2compat 작업 가이드

## 프로젝트 개요

Codex CLI의 Responses API를 OpenAI 호환 Chat Completions API로 변환해주는 프록시 서버입니다.

```
Codex CLI ── POST /responses ──→ codex2compat ── POST /v1/chat/completions ──→ upstream
              GET /models        (localhost:4444)   (OpenAI 호환 API)
```

예시 upstream: CrofAI, OpenRouter, LiteLLM, Ollama, OpenAI

기술 스택: Node.js 22+, TypeScript, Hono OpenAPI, pnpm, oxfmt/oxlint

## 디렉터리 구조

```
src/
├── cli.ts                  # CLI 엔트리포인트 (yargs)
├── config.ts               # parseConfig(): 환경변수 기반 Config 반환
├── logging.ts              # JSONL 로깅: log(), setLogLevel(), createNamedLog(), LogLevel
├── error.ts                # C2cError 클래스
├── deep-merge.ts           # JSON-safe 재귀 deep merge 유틸
├── json.ts                 # OpenAI Chat Completions JSON 파싱 유틸
├── maybe.ts                # Maybe 모나드 (just/NOTHING)
├── server.ts               # createServer(): Hono 서버 + http-terminator graceful shutdown
├── app.ts                  # createApp(): 라우트 등록 + app.notFound 핸들러
├── context.ts              # 서비스 컨텍스트 (Config + ModelsManager)
├── models-manager.ts       # 로컬 models.jsonc 파일 로딩 + Zod 검증
├── utils.ts                # waitAborted()
├── routes/
│   ├── responses.ts        # POST /responses — Zod 스키마 + 변환 + SSE 스트리밍
│   └── models.ts           # GET /models — 로컬 models.jsonc 반환
└── schemas/
    └── models.ts           # ModelsResponse Zod 스키마 (OpenAPI)
tmp/                        # 이전 단일-파일 구현 백업 (참고용)
├── index.ts                # as 남발/타입 안전 X
├── check_zod_type.ts
├── model-catalog.json
├── models.jsonc
└── sample.log
AGENTS.md
README.md
package.json                # ESM, 의존성: Hono, @hono/zod-openapi, zod v4, http-terminator, yargs
tsconfig.json               # module: nodenext, rootDir: src, outDir: dist
```

## 핵심 모듈

### src/cli.ts — CLI 엔트리포인트

- yargs 기반 CLI: `--port`, `--host`, `--base-url`, `--models`, `--log-level`
- `main()`: `parseConfig()` → `setLogLevel()` → `createServer(config, signal)` → serve
- `AbortController`로 graceful shutdown
- startup 실패 시 `log('error')` + `process.exit(1)`

### src/server.ts — Hono 서버

- `createServer(config, signal)`: serve(Hono, config), http-terminator로 graceful shutdown

### src/app.ts — 라우트 등록

- `createApp(context)`: `registerModels()` + `registerResponses()` 호출
- `app.notFound()`: 매칭 안 된 요청을 `log('warn')`으로 기록

### src/config.ts — 설정

```typescript
export type Config = {
  port: number                    // PORT (기본: 4444)
  host: string                    // HOST (기본: 0.0.0.0)
  baseUrl: string                 // BASE_URL (기본: https://crof.ai/v1)
  apiKey?: string                 // API_KEY
  logLevel: LogLevel              // LOG_LEVEL (기본: info, 소문자 변환 후 검증)
  modelsPath?: string             // MODELS_PATH (--models)
  gracefulShutdownTimeoutMs: number // 고정 10_000
}
```

### src/logging.md — JSONL 로깅

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export function setLogLevel(level: LogLevel): void
export function log(level: LogLevel, entryFn: () => LogEntry): void
//       ↓ entryFn은 레벨 필터 통과 시에만 호출 (lazy)
//       ↓ 출력: {"timestamp":"...","level":"...","name":"...","message":"...", ...rest}

export function createNamedLog(name: string): LogFn
//       ↓ name이 자동으로 entry에 포함됨
```

레벨 비교: `debug(10) < info(20) < warn(30) < error(40)`
기본 currentLevel: `info` (startup 시 config 값으로 override)

### src/routes/responses.ts — 핵심 변환 로직 (1034줄)

#### Zod 스키마
- `ResponsesApiRequest`: Codex CLI의 POST /responses 요청 바디 검증
  - `model`, `input`, `instructions`, `tools`, `tool_choice`, `parallel_tool_calls`, `reasoning`, `store`, `stream`, `include`, `metadata`, `max_output_tokens`
- `ResponseItemT`: 출력 아이템 (message / function_call / reasoning)
- `ContentItem`: input_text / input_image / output_text

#### 요청 변환
- `toChatMessages()`: Responses API input → Chat Completions messages
- `convertTools()`: function tools 변환
- Upstream `POST {baseUrl}/chat/completions` 전송

#### SSE 스트리밍
- `readableStreamFromResponse()`: upstream 응답을 ReadableStream으로
- Event-by-event SSE 파싱 (event + data 라인)
- `delta.content` → `emitOutputTextDelta()` (output_text.delta)
- `delta.tool_calls` → `emitFunctionCallArgumentsDelta()` + `emitOutputItemAdded/emitOutputItemDone()`
- `flushCurrentItem()`: 완료 시 message/function_call output_item.done 전송
- `emitCompleted()`: usage 포함 response.completed

#### ID 생성 (OpenAI 검증 완료 — 2026-05-12)

| 함수 | 포맷 | 예시 |
|------|------|------|
| `generateResponseId()` | `resp_` + 50 hex (25 bytes) | `resp_0309c0d6...` |
| `generateItemId('msg')` | `msg_` + 50 hex (25 bytes) | `msg_0309c0d6...` |
| `generateItemId('fc')` | `fc_` + 50 hex (25 bytes) | `fc_0309c0d6...` |
| `generateCallId()` | `call_` + base64url(18 bytes) | `call_ueWI5DaD...` |

#### SSE 이벤트 검증 정보 (OpenAI HTTP/SSE 로그 기반)

**Codex CLI가 처리하는 이벤트 (반드시 전송)**:
- `response.created` — response.id 포함
- `response.output_item.added` — message/function_call
- `response.output_text.delta` — 텍스트 델타
- `response.output_item.done` — 완전한 item
- `response.completed` — usage 포함

**Codex CLI가 무시하는 이벤트 (전송 불필요, `trace("unhandled")`로 드랍)**:
- `response.in_progress`
- `response.content_part.added`
- `response.content_part.done`
- `response.output_text.done`
- `response.function_call_arguments.delta` ← 우리가 보내지만 실제로 드랍됨
- `response.function_call_arguments.done` ← 마찬가지

### src/routes/models.ts — 모델 목록

- `GET /models`: ModelsManager의 models.jsonc를 Codex ModelsResponse 포맷으로 반환
- Upstream fetch 없음 (로컬 파일 기반)

### src/models-manager.ts — ModelsManager

- `ModelsManager.create(modelsPath)`:
  - `loadModelsForFile()`: JSONC 파일 로딩 + strip-json-comments
  - `ModelsForFile` Zod 스키마 검증
  - `fillModelsForFile()`: display_name, supported_reasoning_levels, base_instructions 기본값 채움
  - `ModelsResponse.parse()`로 최종 검증
  
- `ModelsResponse` 포맷:
  ```jsonc
  // models.jsonc
  { "models": [
    { "slug": "kimi-k2.6-precision",
      "display_name": "Kimi K2.6 Precision",
      "supported_reasoning_levels": [{"effort":"medium"}],
      "shell_type": "shell_command",
      "base_instructions": "..."  // 자동 로딩
    }
  ]}
  ```

### src/deep-merge.ts

- JSON-safe plain object deep merge
- 중첩 객체만 재귀 merge, 배열은 덮어쓰기
- `b` 값이 `a`보다 우선

## 개발 명령어

```bash
# 실행
BASE_URL=https://crof.ai/v1 API_KEY=... npx tsx src/cli.ts

# models 파일 지정
npx tsx src/cli.ts --base-url https://crof.ai/v1 --models ./models.jsonc --log-level debug

# 포맷 (파일 지정 가능)
pnpm oxfmt src/

# 린트 + 자동 수정 (파일 지정 가능)
pnpm oxlint --fix src/

# 타입 체크
pnpm tsc --noEmit
```

## 작업 규칙

- `.js` 확장자 import (`import from './foo.js'`)
- ESM (`module: nodenext`)
- JSONL 로깅 우선 (`log()` 사용, `console.*` 지양)
- `as` 캐스팅 지양, 타입 안전하게 작성
- 의존성 추가는 최소화
- 커밋은 간결하고 명확하게

## Codex CLI 디버깅

Codex CLI 자체 로그를 활성화하여 검증:

```bash
# WebSocket 비활성화 + SSE 이벤트 로깅 (수정된 바이너리 필요)
CODEX_RS_DISABLE_WS=1 RUST_LOG=codex_api=trace ~/path/to/codex-tui

# 로그 파일
tail -f ~/.codex/log/codex-tui.log | grep "SSE event:"
```

Codex CLI가 무시하는 SSE 이벤트 확인:
```bash
rg "unhandled" ~/.codex/log/codex-tui.log
```

## 참고 자료

### Codex CLI 소스 코드 (참고용)

- 경로: `~/repo/upstreams/codex`
- origin: https://github.com/openai/codex
- 주요 참고:
  - `codex-api/src/sse/responses.rs` — SSE 이벤트 처리 (`process_responses_event`)
  - `codex-api/src/common.rs` — ResponseEvent enum, ResponsesApiRequest
  - `codex-api/src/endpoint/responses.rs` — HTTP 요청 구성
  - `codex-client/src/transport.rs` — HTTP 전송 (trace!로 요청 바디 로깅)
  - `core/src/client.rs` — `responses_websocket_enabled()`, `stream_responses_api()`

### tmp/index.ts

- 이전 단일-파일 구현 백업
- `as` 타입 뭉개짐, Chat Completions 직접 파싱, 참고용으로만 보관

## 구현 현황

### 작동 중

| 기능 | 상태 |
|------|------|
| JSONL 로깅 시스템 (`createNamedLog`) | ✅ |
| Config 환경변수 기반 파싱 | ✅ |
| CLI 플래그 (yargs) | ✅ |
| Graceful shutdown (http-terminator) | ✅ |
| Deep merge 유틸 | ✅ |
| Fallback 요청 로깅 (`app.notFound`) | ✅ |
| Responses API Zod 스키마 | ✅ |
| POST /responses → upstream Chat Completions 변환 | ✅ |
| SSE 스트리밍 (all events: output_text.delta, output_item.added/done, completed) | ✅ |
| ID 포맷 (resp_+50hex, msg_/fc_+50hex, call_+base64url) | ✅ |
| GET /models (로컬 JSONC 파일 기반) | ✅ |
| upstream tool call ID 보존 | ✅ |
| 디버그 로깅 (upstream 청크, SSE 이벤트) | ✅ |

### TODO (우선순위 순)

1. **OpenAPI /openapi.json + Swagger UI (`/docs`)** — Hono OpenAPI 활용
2. `@ai-sdk/openai-compatible`을 통한 upstream 호출로 전환 (선택)
3. 응답 캐싱 (모델 목록)
4. 멀티 upstream 지원
5. npm 배포 준비 (`dist/`, `package.json` 필드)
6. GET /v1/models upstream 프록시 (현재는 로컬 파일만)
