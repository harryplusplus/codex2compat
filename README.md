# codex2compat

Codex CLI **Responses API** → OpenAI **Chat Completions API** 변환 프록시.

```
Codex CLI ── POST /responses ──→ codex2compat ── POST /v1/chat/completions ──→ upstream
               GET /models      (localhost:4444)    (OpenAI 호환 API)
```

> 지원 upstream: CrofAI, OpenRouter, LiteLLM, Ollama, OpenAI 등 Chat Completions API를 제공하는 모든 곳

---

## 왜 필요한가

Codex CLI는 자체 **Responses API** (`POST /responses`, 전용 ModelsResponse 포맷)를 사용하지만,
대부분의 LLM 제공자는 OpenAI **Chat Completions API** (`POST /v1/chat/completions`)만 지원합니다.
이 어댑터가 그 차이를 중개합니다.

---

## 현재 상태 (로컬)

| 엔드포인트 | 설명 | 상태 |
|-----------|------|------|
| `POST /responses` (streaming) | Responses API 요청 → Chat Completions 변환 → SSE 스트리밍 | ✅ 작동 |
| `GET /models` | 로컬 models.json 파일 기반 모델 목록 반환 | ✅ 작동 |
| `POST /responses` (non-streaming) | 미지원, Codex CLI는 항상 `stream:true` | ❌ 불필요 |

---

## 실행

```bash
# 의존성 설치
pnpm install

# 실행 (환경변수)
BASE_URL=https://crof.ai/v1  API_KEY=...  npx tsx src/cli.ts

# 로컬 models 파일로 실행 (선택)
npx tsx src/cli.ts --models ./models.jsonc --log-level debug --port 4444
```

### CLI 플래그

| 플래그 | 환경변수 | 기본값 | 설명 |
|--------|---------|--------|------|
| `--port` | `PORT` | `4444` | 서버 포트 |
| `--host` | `HOST` | `0.0.0.0` | 서버 호스트 |
| `--base-url` | `BASE_URL` | `https://crof.ai/v1` | upstream Chat Completions API URL |
| `--models` | `MODELS_PATH` | — | 로컬 models.jsonc 파일 경로 |
| `--log-level` | `LOG_LEVEL` | `info` | 로깅 레벨 (debug / info / warn / error) |

### Codex CLI 설정

```toml
# ~/.codex/config.toml
[model_providers.codex2compat]
name = "codex2compat"
base_url = "http://localhost:4444"

# 활성화
model_provider = "codex2compat"
```

---

## SSE 이벤트 포맷

Codex CLI가 소비하는 Responses API SSE 이벤트 목록입니다.
(OpenAI HTTP/SSE 응답을 Codex CLI 로그로 직접 검증 완료 — 2026-05-12)

### 전송해야 하는 이벤트 (Codex CLI가 처리함)

| 이벤트 | 설명 | 비고 |
|--------|------|------|
| `response.created` | 응답 시작 | `response.id` (resp_ + 50 hex) 포함 |
| `response.output_item.added` | 새 output item 추가 | reasoning/message/function_call |
| `response.output_text.delta` | 텍스트 스트리밍 | `item_id`, `delta` |
| `response.output_item.done` | output item 완료 | 완전한 item payload |
| `response.completed` | 응답 완료 | `usage` (tokens) 포함 |

### Codex CLI가 무시하는 이벤트 (전송 불필요)

OpenAI도 보내지만 Codex CLI의 `process_responses_event()`에서 `trace("unhandled")`로 드랍됩니다.

| 이벤트 | 드랍 이유 |
|--------|-----------|
| `response.in_progress` | 처리 로직 없음 |
| `response.content_part.added` | 처리 로직 없음 |
| `response.content_part.done` | 처리 로직 없음 |
| `response.output_text.done` | text는 `output_item.done`에서 제공 |
| `response.function_call_arguments.delta` | args는 `output_item.done`에서 제공 |
| `response.function_call_arguments.done` | args는 `output_item.done`에서 제공 |

**결론**: `function_call_arguments.delta`는 전송해도 Codex CLI가 무시하므로 생략 가능. `output_item.done`에 `name`, `arguments`, `call_id`를 모두 포함해야 함.

### OpenAI 검증된 이벤트 시퀀스

```
1. response.created
2. response.output_item.added  (reasoning, rs_ prefix)
3. response.output_item.done   (reasoning)
4. response.output_item.added  (message, msg_ prefix)
5. response.output_text.delta × N
6. response.output_item.done   (message)
7. response.output_item.added  (function_call, fc_ prefix)
8. response.output_item.done   (function_call)
9. response.completed          (usage 포함)
```

---

## ID 포맷 (OpenAI 검증 완료)

| ID | 포맷 | 예시 |
|----|------|------|
| `response.id` | `resp_` + 50 hex chars (25 bytes) | `resp_0309c0d6cb4ff519016a032143c2288191b3759a2e031f11b2` |
| `item_id` (message) | `msg_` + 50 hex chars (25 bytes) | `msg_0309c0d6cb4ff519016a03214e4e7c8191bf036ec8113050a7` |
| `item_id` (function_call) | `fc_` + 50 hex chars (25 bytes) | `fc_0309c0d6cb4ff519016a032152eb1c819182b3994c61de195b` |
| `item_id` (reasoning) | `rs_` + 50 hex chars (25 bytes) | `rs_0309c0d6cb4ff519016a03214c9eb08191b938b46b170f9d90` |
| `call_id` | `call_` + base64url(18 bytes) = 24 chars | `call_ueWI5DaDk7YLNXdK8uBWyUTg` |

---

## 아키텍처

### 디렉터리 구조

```
src/
├── cli.ts                  # CLI 엔트리포인트 (yargs)
├── config.ts               # 환경변수 기반 Config 파싱
├── logging.ts              # JSONL 로깅 (log, createNamedLog)
├── error.ts                # 에러 타입
├── deep-merge.ts           # JSON-safe 재귀 deep merge
├── json.ts                 # OpenAI Chat Completions JSON 파싱 유틸
├── maybe.ts                # Maybe 모나드
├── server.ts               # Hono 서버 생성 + graceful shutdown
├── app.ts                  # 라우트 등록 + notFound 핸들러
├── context.ts              # 서비스 컨텍스트 (Config, ModelsManager)
├── models-manager.ts       # 로컬 models.jsonc 파일 로딩 + 검증
├── utils.ts                # 공통 유틸
├── routes/
│   ├── responses.ts        # POST /responses — 변환 + SSE 스트리밍 (1034줄)
│   └── models.ts           # GET /models — 모델 목록 반환
└── schemas/
    └── models.ts           # Zod 스키마: ModelsResponse
tmp/                        # 이전 단일-파일 구현 백업 (참고용)
```

### 핵심 변환 로직 (`src/routes/responses.ts`)

1. **요청 변환**: Responses API → Chat Completions
   - Zod 스키마 검증 → `toChatMessages()`로 메시지 변환
   - `convertTools()`로 function tools 변환
   - Upstream `POST /v1/chat/completions` 전송

2. **SSE 스트리밍**: Chat Completions 청크 → Responses API 이벤트
   - `delta.content` → `response.output_text.delta`
   - `delta.tool_calls` → `response.output_item.added`/`done` (function_call)
   - `usage` + `response.id` → `response.completed`
   - ID 생성 (resp_/msg_/fc_ + hex, call_ + base64url)

3. **상태 관리**
   - `accumulatedContent`: 현재 메시지 텍스트 누적
   - `accumulatedToolCalls`: tool call 인자 누적 (index별 Map)
   - `flushCurrentItem()`: 메시지/tool call 완료 시 output_item.done 전송

---

## 개발

```bash
pnpm tsc --noEmit              # 타입 체크
pnpm oxfmt src/                # 포맷
pnpm oxlint --fix src/         # 린트
npx tsx src/cli.ts             # 실행 (CLI)
```

### 출력 (stdout)

```
{"timestamp":"...","level":"info","name":"server","message":"listening on http://0.0.0.0:4444"}
```

`--log-level debug` 시 upstream 청크 디버그 로그도 출력:
```
{"timestamp":"...","level":"debug","name":"routes.responses","message":"upstream chunk","id":"chatcmpl-...","choices":[...]}
```

---

## 기술 스택

- **런타임**: Node.js 22+
- **언어**: TypeScript (ESM, `module: nodenext`)
- **웹 프레임워크**: Hono (`@hono/zod-openapi`)
- **검증**: Zod v4
- **패키지 매니저**: pnpm
- **포맷/린트**: oxfmt / oxlint
- **포맷팅**: JSONL 로깅 (표준 출력)

---

## 참고 자료

- `~/repo/upstreams/codex` — Codex CLI 소스 코드 (Rust)
  - `codex-api/src/sse/responses.rs` — SSE 이벤트 처리 로직
  - `codex-api/src/common.rs` — ResponseEvent enum
  - `codex-api/src/endpoint/responses.rs` — HTTP 요청 구성
- `~/.codex/log/codex-tui.log` — Codex CLI 로그 (`RUST_LOG=codex_api=trace`)
