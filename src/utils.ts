export function waitAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}
