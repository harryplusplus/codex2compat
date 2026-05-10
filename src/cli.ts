import { Command, InvalidArgumentError } from 'commander'
import {
  BaseUrl,
  Config,
  DEFAULT_BASE_URL,
  DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT,
  DEFAULT_HOST,
  DEFAULT_MODELS_PATH,
  DEFAULT_PORT,
  GracefulShutdownTimeout,
  Host,
  Port,
} from './config.js'
import { DEFAULT_LOG_LEVEL, LogLevel } from './logging.js'
import { z } from '@hono/zod-openapi'

function parseSchema<T>(schema: z.ZodType<T>, value: string): T {
  const { error, data } = schema.safeParse(value)
  if (error) {
    throw new InvalidArgumentError(z.treeifyError(error).errors.join(', '))
  }

  return data
}

const program = new Command()

program
  .name('codex2compat')
  .description('Codex Responses API to OpenAI-compatible proxy')
  .option(
    '--base-url <url>',
    'OpenAI-compatible upstream base URL',
    v => parseSchema(BaseUrl, v),
    DEFAULT_BASE_URL,
  )
  .option('--models <path>', 'models JSON path', DEFAULT_MODELS_PATH)
  .option(
    '--host <address>',
    'bind address',
    v => parseSchema(Host, v),
    DEFAULT_HOST,
  )
  .option(
    '--port <number>',
    'port number',
    v => parseSchema(Port, v),
    DEFAULT_PORT,
  )
  .option(
    '--log-level <level>',
    `log level (available values: ${LogLevel.options.join(', ')})`,
    v => parseSchema(LogLevel, v),
    DEFAULT_LOG_LEVEL,
  )
  .option(
    '--graceful-shutdown-timeout <timeout>',
    'graceful shutdown timeout (unit: milliseconds)',
    v => parseSchema(GracefulShutdownTimeout, v),
    DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT,
  )
  .option('-v, --version', 'show version')
  .addHelpText(
    'afterAll',
    [
      '',
      'Environment Variables:',
      '  API_KEY  upstream API key (default: undefined)',
    ].join('\n'),
  )
  .action(async opts => {
    if (opts.version) {
      await import('./commands/version.js').then(m => m.default())
      return
    }

    const config = Config.parse({ ...opts, apiKey: process.env.API_KEY })
    await import('./commands/serve.js').then(m => m.default(config))
  })
  .parse()
