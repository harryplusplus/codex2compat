import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from '../context.js'
import { ModelsResponse } from '../schemas/models.js'

const getModels = createRoute({
  method: 'get',
  path: '/models',
  responses: {
    200: {
      description: 'List of available models in Codex format',
      content: { 'application/json': { schema: ModelsResponse } },
    },
  },
})

export function registerModels(app: OpenAPIHono, context: Context): void {
  app.openapi(getModels, c => {
    return c.json(context.modelsManager.models)
  })
}
