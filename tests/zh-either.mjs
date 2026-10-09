/** Either-script (SC|TC) helpers for unit tests after zh-HK Traditional migration. */
import { simplifiedToTraditionalHK } from '../src/i18n/sc2tcHK.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

/** Escape a string for use inside a RegExp source. */
export function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Build a RegExp that matches either the given string or its SC↔TC counterpart. */
export function eitherScriptRe(s, flags = '') {
  const a = String(s)
  const tc = simplifiedToTraditionalHK(a)
  const sc = traditionalToSimplified(a)
  const alts = [...new Set([a, tc, sc].filter(Boolean))].map(escapeRe)
  return new RegExp(alts.join('|'), flags)
}

/** True if haystack contains needle in either script. */
export function includesEither(haystack, needle) {
  const h = String(haystack ?? '')
  const n = String(needle ?? '')
  if (!n) return true
  if (h.includes(n)) return true
  const tc = simplifiedToTraditionalHK(n)
  const sc = traditionalToSimplified(n)
  return h.includes(tc) || h.includes(sc)
}

/** Assert haystack matches needle in either script (throws AssertionError-like Error). */
export function assertIncludesEither(haystack, needle, msg) {
  if (!includesEither(haystack, needle)) {
    throw new Error(msg || `Expected to include either-script form of ${JSON.stringify(needle)}\nGot: ${String(haystack).slice(0, 200)}`)
  }
}
