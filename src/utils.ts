export function waitAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

export type Just<T> = [true, T]

export function just<T>(data: T): Just<T> {
  return [true, data]
}

export type Nothing = [false, never]

export const NOTHING: Nothing = [false, undefined as never]

export type Maybe<T> = Just<T> | Nothing
