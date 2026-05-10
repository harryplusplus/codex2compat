import { serve } from '@hono/node-server'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { createNamedLog } from './logging.js'
import { createHttpTerminator, type HttpTerminator } from 'http-terminator'
import type { Server as HttpServer } from 'node:http'

const log = createNamedLog('server')

export class Server {
  _ready: Promise<void>
  _terminator: HttpTerminator

  constructor(input: {
    app: OpenAPIHono
    host: string
    port: number
    gracefulShutdownTimeout: number
  }) {
    const { app, host, port, gracefulShutdownTimeout } = input

    const server = serve({ fetch: app.fetch, hostname: host, port }, info => {
      log('info', () => ({
        message: `listening on http://${info.address}:${info.port}`,
      }))
    })
    this._ready = new Promise((resolve, reject) => {
      server.on('listening', resolve)
      server.on('error', reject)
    })

    this._terminator = createHttpTerminator({
      server: server as HttpServer,
      gracefulTerminationTimeout: gracefulShutdownTimeout,
    })
  }

  get ready(): Promise<void> {
    return this._ready
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this._terminator.terminate()
  }
}
