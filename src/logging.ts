import { z } from '@hono/zod-openapi'
import type { JsonValue } from './types.js'

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error'])

export type LogLevel = z.infer<typeof LogLevel>

export const DEFAULT_LOG_LEVEL: LogLevel = 'info'

let currentLogLevel: LogLevel = DEFAULT_LOG_LEVEL

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export type LogEntry = { message: string } & Record<string, JsonValue>

export type LogEntryFn = () => LogEntry

export type LogFn = (level: LogLevel, entryFn: LogEntryFn) => void

export const log: LogFn = (level, entryFn) => {
  if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[currentLogLevel]) {
    return
  }

  const logObj: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
  }

  const { name, message, ...rest } = entryFn()
  if (name) {
    logObj.name = name
  }

  logObj.message = message
  Object.assign(logObj, rest)

  const line = JSON.stringify(logObj)
  process.stdout.write(line + '\n')
}

export function createNamedLog(name: string): LogFn {
  return (level, entryFn) => log(level, () => ({ name, ...entryFn() }))
}
