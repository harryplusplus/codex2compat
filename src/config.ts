import { LogLevel } from './logging.js'
import { z } from '@hono/zod-openapi'

export const DEFAULT_PORT: number = 4444

export const Port = z.coerce.number().gt(0).lt(65535)

export const DEFAULT_HOST: string = '0.0.0.0'

export const Host = z.ipv4().or(z.literal('localhost'))

export const DEFAULT_MODELS_PATH: string = 'models.json'

export const ModelsPath = z.string()

export const DEFAULT_BASE_URL: string = 'https://crof.ai/v1'

export const BaseUrl = z.url()

export const DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT: number = 10_000 // unit: milliseconds

export const GracefulShutdownTimeout = z.coerce.number().gte(0)

export const ApiKey = z.string().optional()

export const Config = z.object({
  logLevel: LogLevel,
  gracefulShutdownTimeout: GracefulShutdownTimeout,
  host: Host,
  port: Port,
  baseUrl: BaseUrl,
  apiKey: ApiKey,
  models: ModelsPath,
})
export type Config = z.infer<typeof Config>
