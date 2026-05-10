function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...a }

  for (const [key, value] of Object.entries(b)) {
    if (isPlainObject(value) && isPlainObject(a[key])) {
      result[key] = deepMerge(a[key] as Record<string, unknown>, value)
    } else {
      result[key] = value
    }
  }

  return result
}
