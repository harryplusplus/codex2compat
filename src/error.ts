import type { JsonObject } from './json.js'

export class C2cError extends Error {
  details?: JsonObject

  constructor(
    message: string,
    options?: ErrorOptions & { details?: JsonObject },
  ) {
    const { details, ...errorOpts } = options ?? {}
    super(message, errorOpts)
    this.details = details
  }
}
