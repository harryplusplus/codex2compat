import type { Config } from './config.js'
import type { ModelsManager } from './models-manager.js'

export type Context = {
  config: Config
  signal: AbortSignal
  modelsManager: ModelsManager
}
