export function waitAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

export type Some<T> = [true, T]

export function some<T>(data: T): Some<T> {
  return [true, data]
}

export type None = [false, never]

export const NONE: None = [false, undefined as never]

export type Option<T> = Some<T> | None
