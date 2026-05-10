import { createApp } from '../app.js'
import { type Config } from '../config.js'
import type { Context } from '../context.js'
import { createNamedLog, setLogLevel } from '../logging.js'
import { ModelsManager } from '../models-manager.js'
import { Server } from '../server.js'
import { waitAborted } from '../utils.js'

const log = createNamedLog('commands.serve')

async function run(config: Config): Promise<boolean> {
  setLogLevel(config.logLevel)

  const ac = new AbortController()
  const { signal } = ac
  process.on('SIGINT', () => ac.abort())
  process.on('SIGTERM', () => ac.abort())

  const modelsManager = new ModelsManager()
  if (!(await modelsManager.init(config.models))) {
    return false
  }

  const context: Context = { config, signal, modelsManager }
  const app = createApp(context)

  await using server = new Server({ app, ...config })
  await server.ready

  await waitAborted(signal)
  log('info', () => ({ message: 'shutdown requested' }))
  return true
}

export default async function (config: Config): Promise<void> {
  try {
    if (!(await run(config))) {
      process.exit(1)
    }

    log('info', () => ({ message: 'exiting cleanly' }))
  } catch (err) {
    log('error', () => ({
      message: 'unexpected error occurred',
      error: String(err),
    }))
    process.exit(1)
  }
}
