/** Explicit URL opt-in for browser UI checks: keep the test document in memory. */
export function isUiTestIsolation(search?: string): boolean {
  const value = search ?? (typeof window === 'undefined' ? '' : window.location.search)
  try { return new URLSearchParams(value).get('ui-test') === '1' } catch { return false }
}

export function documentPersistenceEnabled(search?: string): boolean {
  return !isUiTestIsolation(search)
}
