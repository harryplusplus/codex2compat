import { OpenAPIHono } from '@hono/zod-openapi'
import { registerModels } from './routes/models.js'
import { registerResponses } from './routes/responses.js'
import { createNamedLog } from './logging.js'
import type { Context } from './context.js'

const log = createNamedLog('app')

export function createApp(context: Context): OpenAPIHono {
  const app = new OpenAPIHono()

  registerModels(app, context)
  registerResponses(app, context)

  app.notFound(c => {
    log('warn', () => ({
      message: 'unmatched handler',
      method: c.req.method,
      path: c.req.path,
    }))

    return c.json({ error: 'not found' }, 404)
  })

  return app
}
