# codex2compat

Codex Responses API → OpenAI Chat Completions API 매핑 프록시.

Codex CLI는 **Responses API** (`POST /v1/responses`)와 전용 ModelsResponse 포맷을 사용하지만,
많은 LLM 제공자는 OpenAI **Chat Completions API** (`POST /v1/chat/completions`)만 지원합니다.
이 어댑터가 그 차이를 중개합니다.

```
Codex CLI → codex2compat (localhost:4444) → upstream (OpenAI-compat /chat/completions)
```

> 지원 upstream: crof.ai, OpenRouter, LiteLLM, Ollama, OpenAI direct 등
> Chat Completions API를 제공하는 모든 곳

---

## 왜 필요한가

- Codex CLI는 Responses API (`POST /v1/responses`)와 Codex 전용 `ModelsResponse` 포맷을 사용함
- 대부분의 LLM 제공자는 Chat Completions API (`POST /v1/chat/completions`)만 지원함
- OpenAI조차 Responses API를 아직 널리 지원하지 않음 (Chat Completions가 사실상 표준)
- codex-relay(Rust)는 변환을 해주지만 `/v1/models` 변환은 안 함
- 그래서 이걸 함

---

## 현재 상태 (로컬)

작동 중인 기능:

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /v1/models` | crof.ai 모델 목록 조회 → Codex `ModelsResponse` 변환 |
| `POST /v1/responses` (non-streaming) | Responses API 요청 → Chat Completions 변환 → 응답 변환 |
| `POST /v1/responses` (streaming) | SSE 스트리밍: Chat Completions 청크 → Responses API 이벤트로 변환 |

### 실행

```bash
CROF_API_KEY=nahcrof_... npx tsx index.ts
# → http://127.0.0.1:4444
```

### Codex CLI 설정

```toml
# ~/.codex/config.toml
[model_providers]
[model_providers.crof]
base_url = "http://127.0.0.1:4444/v1"
# API key는 직접 넣지 말고 CROF_API_KEY 환경변수로
# 근데 codex가 provider config에서 환경변수 읽는 방식 확인 필요
```

---

## 아키텍처

### 핵심 변환 로직

| 레이어 | 입력 | 출력 | 비고 |
|--------|------|------|------|
| **Models** | crof.ai JSON (`{data: [{id, name, context_length, ...}]}`) | Codex `ModelsResponse` (`{models: [ModelInfo, ...]}`) | slug, shell_type, truncation_policy 등 Codex 고유 필드 자동 생성 |
| **Request** | Responses API (`model, input, instructions, tools, ...`) | Chat Completions (`model, messages, tools, ...`) | `translate.rs` 로직을 그대로 TS로 포팅 |
| **Response** (non-streaming) | Chat Completions JSON | Responses API JSON (`id, object, output, usage`) | 1:1 단순 변환 |
| **Response** (streaming) | Chat Completions SSE chunks (`delta.content`, `delta.reasoning_content`, ...) | Responses API SSE events (`response.created`, `output_text.delta`, `function_call_arguments.delta`, `response.completed`) | `stream.rs` 로직을 그대로 TS로 포팅 |

### Session 관리

- `previous_response_id` 기반 히스토리 복원을 위해 in-memory Map 사용
- Reasoning content도 `reasoningByCallId` Map에 저장해서 tool call 재생성 시 복원
- 현재는 간단한 Map; 필요하면 Redis나 파일로 확장 가능

### 모델 변환 매핑

| crof.ai 필드 | Codex ModelInfo 필드 |
|-------------|-------------------|
| `id` | `slug` |
| `name` | `display_name` |
| `context_length` | `context_window`, `truncation_policy.limit`, `auto_compact_token_limit` |
| `reasoning_effort` / `custom_reasoning` | `default_reasoning_level`, `supported_reasoning_levels` |
| — | `shell_type: "shell_command"` (고정) |
| — | `visibility: "list"` (고정) |
| — | `base_instructions: ""` (고정, 필요시 config에서 오버라이드) |

---

## 기술 스택

- **런타임**: Node.js 22+ (tsx로 실행)
- **의존성**: 0 (Node.js 빌트인만 사용: `node:http`, `node:https`, `node:crypto`, `node:url`)
- **실행**: `npx tsx index.ts` 또는 `node --experimental-strip-types index.ts`

---

## 브레인스토밍 / 미래 구현 (TODO)

### 1. Config 파일 지원

```
c2c.config.ts / .mts / .cts / .mjs / .cjs / .js
```

자동 탐색 + `--config` 플래그로 명시적 지정.

정의:
```typescript
export default defineConfig({
  models: {
    "deepseek-v4-pro": {
      shell_type: "local",
      supports_parallel_tool_calls: true,
      display_name: "DeepSeek V4 Pro (커스텀)",
      base_instructions: "당신은 유용한 어시스턴트입니다.",
      // ModelInfo의 모든 필드 오버라이드 가능
    },
  },
  hooks: {
    transformModel: (crofModel, defaultInfo) => modifiedInfo,
    beforeChatRequest: (req) => modifiedReq,
    afterChatResponse: (resp) => modifiedResp,
    beforeSseEvent: (event, data) => modifiedData,
  },
  crof: {
    base_url: "https://crof.ai/v1",
    api_key_env: "CROF_API_KEY",
  },
  server: {
    port: 4444,
    host: "127.0.0.1",
  },
});
```

**TS config 읽기**: jiti를 dep으로 박거나 사용자에게 tsx 실행을 위임.  
npm 배포 시에는 `.mjs`/`.cjs` config만 공식 지원하고 TS는 옵션.

### 2. npm 배포 (`npx -y c2c@latest`)

- `src/index.ts` → `tsc`로 `dist/index.mjs`로 컴파일
- `package.json`: `dependencies: {}` (의존성 제로)
- Config 로딩: `.mjs > .cjs > .js`만 공식 지원
- TS config는 jiti를 peer dep으로 빼거나 사용자가 `npx tsx`로 실행

### 3. 모델별 커스텀 필드

crof.ai 모델마다 다른 필드가 있어서 config에서 provider별/모델별 매핑 가능하게:

```typescript
// 예: reasoning_effort 필드 이름이 모델마다 다름
models: {
  "deepseek-v4-pro": { reasoning_field: "reasoning_effort" },
  "kimi-k2.6":      { reasoning_field: "custom_reasoning" },
}
```

### 4. 멀티 upstream 지원

```typescript
upstreams: {
  crof: { base_url: "https://crof.ai/v1", api_key_env: "CROF_API_KEY" },
  openrouter: { base_url: "https://openrouter.ai/api/v1", api_key_env: "OPENROUTER_API_KEY" },
}
// 요청의 model prefix나 header로 라우팅
```

### 5. 헬스 체크 / 메트릭

- `GET /v1` → alive 응답
- `GET /-/metrics` → 요청 카운트, 레이턴시 등

### 6. TLS / HTTPS 지원

- `--cert` / `--key` 플래그로 localhost HTTPS 서빙
- Codex CLI가 http를 허용하는지 확인 필요

### 7. 응답 캐싱

모델 목록은 TTL 기반 메모리 캐싱 (지금도 매번 fetch하는 중)

---

## 기존 codex-relay와의 관계

codex-relay (Rust, `codex-relay/`)는:
- **안 하는 것**: `/v1/models` 변환 (pass-through만)
- **안 하는 것**: SSE 스트리밍에서 reasoning_content 이벤트 분리
- **하는 것**: Responses API ↔ Chat Completions 변환

codex2compat (이 프로젝트)는 위 모든 것을 + `/v1/models` 변환까지 함.

---

## 로컬 개발

```bash
# 실행
CROF_API_KEY=... npx tsx index.ts

# SSE 스트리밍 테스트
curl -s -N -X POST http://127.0.0.1:4444/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-pro","input":"say hi","stream":true,"max_output_tokens":50}'

# 모델 목록 테스트
curl -s http://127.0.0.1:4444/v1/models | jq '.models | .[] | {slug, display_name, context_window}'
```
