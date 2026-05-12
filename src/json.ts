import { C2cError } from './error.js'
import { just, NOTHING, type Maybe } from './maybe.js'

export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type JsonObject = Record<string, JsonValue>

type Truncated = { _truncated: { reason: string; path: string } & JsonObject }

type Context = { maxLevel: number; seen: Map<object, string> }

export function toJsonValue(x: unknown, maxLevel: number = 5): JsonValue {
  const ctx: Context = { maxLevel, seen: new Map<object, string>() }
  return _toJsonValue(ctx, x, 1, '.')
}

function _toJsonValue(
  ctx: Context,
  x: unknown,
  level: number,
  path: string,
): Maybe<JsonValue> {
  if (typeof x === 'undefined') {
    return NOTHING
  }

  if (
    typeof x === 'string' ||
    typeof x === 'number' ||
    typeof x === 'boolean' ||
    x === null
  ) {
    return just(x)
  }

  if (typeof x === 'symbol' || typeof x === 'bigint') {
    return just(x.toString())
  }

  if (typeof x === 'function') {
    return just({
      _truncated: { reason: 'function', path },
    } satisfies Truncated)
  }

  if (level > ctx.maxLevel) {
    return just({
      _truncated: {
        reason: 'depth_limit_exceeded',
        path,
        max_level: ctx.maxLevel,
      },
    } satisfies Truncated)
  }

  const originPath = ctx.seen.get(x)
  if (originPath) {
    return just({
      _truncated: {
        reason: 'circular_reference_detected',
        path,
        origin_path: originPath,
      },
    } satisfies Truncated)
  }

  ctx.seen.set(x, path)

  if (x instanceof C2cError) {
    return toJsonValueFromC2cError(ctx, x, level, path)
  }

  if (x instanceof Error) {
    return toJsonValueFromError(ctx, x, level, path)
  }

  if (Array.isArray(x)) {
    return toJsonValueFromArray(ctx, x, level, path)
  }

  if (typeof x === 'object') {
    return toJsonValueFromObject(ctx, x, level, path)
  }

  return just({
    _truncated: { reason: 'unexpected_kind', path },
  } satisfies Truncated)
}

function nextPath(path: string, key: string | number): string {
  if (typeof key === 'string') {
    const isPlain = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
    if (isPlain) {
      return path === '.' ? `.${key}` : `${path}.${key}`
    } else {
      const formattedKey = `["${key}"]`
      return path === '.' ? `${formattedKey}` : `${path}${formattedKey}`
    }
  } else {
    return path === '.' ? `[${key}]` : `${path}[${key}]`
  }
}

function toJsonValueFromC2cError(
  ctx: Context,
  x: C2cError,
  level: number,
  path: string,
): Maybe<JsonValue> {
  const obj: JsonObject = { name: x.name, message: x.message }
  if (x.stack) {
    obj.stack = x.stack
  }
  if (x.details) {
    obj.details = x.details
  }
  if (x.cause) {
    const [ok, cause] = _toJsonValue(
      ctx,
      x.cause,
      level + 1,
      nextPath(path, 'cause'),
    )
    if (ok) {
      obj.cause = cause
    }
  }
  return just(obj)
}

function toJsonValueFromError(
  ctx: Context,
  x: Error,
  level: number,
  path: string,
): Maybe<JsonValue> {
  const obj: JsonObject = { name: x.name, message: x.message }
  if (x.stack) {
    obj.stack = x.stack
  }
  if (x.cause) {
    const [ok, cause] = _toJsonValue(
      ctx,
      x.cause,
      level + 1,
      nextPath(path, 'cause'),
    )
    if (ok) {
      obj.cause = cause
    }
  }
  return just(obj)
}

function toJsonValueFromArray(
  ctx: Context,
  xs: unknown[],
  level: number,
  path: string,
): Maybe<JsonValue> {
  const arr: JsonValue = []
  xs.forEach((x, i) => {
    const [ok, jsonVal] = _toJsonValue(ctx, x, level + 1, nextPath(path, i))
    if (ok) {
      arr.push(jsonVal)
    }
  })
  return just(arr)
}

function toJsonValueFromObject(
  ctx: Context,
  x: object,
  level: number,
  path: string,
): Maybe<JsonValue> {
  const obj: JsonObject = {}
  for (const [key, val] of Object.entries(x)) {
    const [ok, jsonVal] = _toJsonValue(ctx, val, level + 1, nextPath(path, key))
    if (ok) {
      obj[key] = jsonVal
    }
  }
  return just(obj)
}
