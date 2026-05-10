# codex2compat 작업 가이드

## 프로젝트 개요

Codex의 Responses API를 OpenAI 호환 API로 변환해주는 프록시 서버입니다.

```
Codex (Responses API) → codex2compat → upstream (OpenAI 호환 API)
```

예시 upstream: CrofAI, OpenRouter, LiteLLM, Ollama, OpenAI

기술 스택: Node.js 22+, TypeScript, Hono OpenAPI, pnpm, oxfmt/oxlint

## 디렉터리 구조

```
src/
├── main.ts         # 엔트리포인트: main() → parseConfig() → setLogLevel() → createServer() → serve()
├── server.ts       # createServer(): Hono 앱 생성, 라우트 등록, fallback 핸들러
├── config.ts       # parseConfig(): 환경변수 기반 Config 반환
├── logging.ts      # JSONL 로깅: log(), setLogLevel(), createNamedLog(), LogLevel
├── responses.ts    # Zod 스키마 + postResponsesRoute (변환 로직은 TODO)
└── deep-merge.ts   # JSON-safe 재귀 deep merge 유틸
tmp/
├── index.ts        # 이전 단일-파일 구현 백업 (참고용, as 남발/타입 안전 X)
└── check_zod_type.ts
AGENTS.md
tsconfig.json       # module: nodenext, rootDir: src, outDir: dist
package.json        # ESM, 의존성: Hono, @hono/zod-openapi, zod v4, http-terminator
```

## 핵심 모듈

### src/main.ts — 엔트리포인트

- `main()`: `parseConfig()` → `setLogLevel()` → `createServer(config, signal)` → serve
- `AbortController`로 graceful shutdown
- startup 실패 시 `log('error')` + `process.exit(1)`

### src/server.ts — Hono 앱

- `createServer(config, signal)`: `OpenAPIHono` 생성, 라우트 등록, `serve()` 호출
- `POST /v1/responses`: `postResponsesRoute` + `streamSSE(c, async stream => ...)` — handler는 현재 TODO
- `app.notFound()`: 매칭 안 된 요청을 `log('warn')`으로 기록 (Codex 요청 탐색용)
- `http-terminator`로 graceful shutdown

### src/config.ts — 설정

```typescript
export type Config = {
  port: number                    // PORT (기본: 4444)
  host: string                    // HOST (기본: 0.0.0.0)
  baseUrl: string                 // BASE_URL (필수)
  apiKey?: string                 // API_KEY
  logLevel: LogLevel              // LOG_LEVEL (기본: info, 소문자 변환 후 검증)
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

### src/responses.ts — Responses API 스키마 + 라우트

- Zod 스키마: `ContentItem`, `ResponseItem` (16 variants), `ResponsesApiRequest` 등
- Export: `ResponsesApiRequest` (타입 + Zod), `postResponsesRoute` (createRoute)
- 변환 로직(toChatRequest, translateSseStream)은 아직 미구현 (handler가 `throw new Error('TODO')`)
- SSE 전용 (non-streaming 미지원): `return streamSSE(c, async stream => ...)`

### src/deep-merge.ts

- JSON-safe plain object deep merge
- 중첩 객체만 재귀 merge, 배열은 덮어쓰기
- `b` 값이 `a`보다 우선

## 개발 명령어

```bash
# 실행 (환경변수 설정 필요)
BASE_URL=https://crof.ai/v1 API_KEY=... npx tsx src/main.ts

# 포맷 (파일 지정 가능)
pnpm oxfmt <path/to/file.ts>

# 린트 + 자동 수정 (파일 지정 가능)
pnpm oxlint --fix <path/to/file.ts>

# 타입 체크 (tsconfig.json 기준, 전체 프로젝트)
pnpm tsc --noEmit
```

## 작업 규칙

- `.js` 확장자 import (`import from './foo.js'`)
- ESM (`module: nodenext`)
- JSONL 로깅 우선 (`log()` 사용, `console.*` 지양)
- `as` 캐스팅 지양, 타입 안전하게 작성
- 의존성 추가는 최소화
- 커밋은 간결하고 명확하게

## 참고 자료

### Codex CLI 소스 코드 (참고용)

- 경로: `~/repo/upstreams/codex`
- origin: https://github.com/openai/codex
- 주요 참고:
  - `codex-api/src/sse/responses.rs` — SSE 이벤트 포맷 (response.created, response.output_text.delta, response.completed 등)
  - `codex-api/src/common.rs` — ResponsesApiRequest, ResponseEvent enum
  - `codex-api/src/endpoint/responses.rs` — HTTP 요청 구성

### tmp/index.ts

- 이전 단일-파일 구현 백업
- `as` 타입 뭉개짐, non-streaming path 존재, 참고용으로만 보관

## 구현 현황

### 작동 중

| 기능 | 상태 |
|------|------|
| JSONL 로깅 시스템 (`createNamedLog`) | ✅ |
| Config 환경변수 기반 파싱 | ✅ |
| Graceful shutdown (http-terminator) | ✅ |
| Deep merge 유틸 | ✅ |
| Fallback 요청 로깅 (`app.notFound`) | ✅ |
| Responses API Zod 스키마 | ✅ |
| `streamSSE` 핸들러 골격 | ✅ |

### TODO (우선순위 순)

1. **POST /v1/responses 핸들러 구현** — `toChatRequest()`, `translateSseStream()`, upstream fetch, Codex SSE 이벤트 생성
2. GET /v1/models — upstream 모델 목록 조회 + Codex 포맷 변환
3. OpenAPI `/openapi.json` + Swagger UI (`/docs`)
4. `@ai-sdk/openai-compatible`을 통한 upstream 호출로 전환 (선택)
5. 응답 캐싱 (모델 목록 등)
6. 멀티 upstream 지원
7. `models.json` 파일 포맷 정의 및 예제 (로컬 오버라이드)
8. npm 배포 준비 (`dist/`, `package.json` 필드)
