/**
 * Validated window-level panel preferences. Only the right panel's saved width
 * crosses a reload; frame measurements, presentation reports, and the left
 * sidebar's drag width stay in memory. Corrupt or shape-mismatched data clears
 * its own key and falls back to the contract defaults, mirroring the
 * right-Sidebar's layout persistence. The shape check is hand-rolled: this
 * package keeps a dependency-free browser face, and the persisted document
 * carries a single integer field.
 */
import { clampWidth, RIGHTBAR_MIN } from './columns.ts'

/** Persistence namespace for the frame's window-level preferences. */
export const layoutPersistence = 'dsh.ui-layout.v1'

/** Absolute ceiling for a saved width; the writing window's frame already
 * clamped to 70% of itself, and a reloaded frame re-clamps to its own range. */
const RIGHTBAR_PERSISTED_MAX = 10000

/** The persisted preference document: one positive integer width. */
interface LayoutPrefs { rightbar: number }

/**
 * Shape-check one parsed document; returns `undefined` for anything else.
 * @param raw - the parsed localStorage value.
 */
function parsePrefs(raw: unknown): LayoutPrefs | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const { rightbar } = raw as { rightbar?: unknown }
  if (typeof rightbar !== 'number' || !Number.isInteger(rightbar)
    || rightbar <= 0 || rightbar > RIGHTBAR_PERSISTED_MAX) return undefined
  return { rightbar }
}

/**
 * Read the saved right panel width for this window.
 * @returns the validated width, or `undefined` when absent, inaccessible or invalid.
 */
export function readLayoutPrefs(): LayoutPrefs | undefined {
  if (typeof localStorage === 'undefined') return undefined
  let raw: string | null
  try { raw = localStorage.getItem(layoutPersistence) }
  catch (_storageUnavailable) { return undefined }
  if (raw === null) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch (_invalidJson) { parsed = undefined }
  const prefs = parsePrefs(parsed)
  if (prefs === undefined) {
    clearLayoutPrefs()
    return undefined
  }
  return { rightbar: clampWidth(prefs.rightbar, RIGHTBAR_MIN, RIGHTBAR_PERSISTED_MAX) }
}

/**
 * Persist the right panel width preference.
 * @param rightbar - current saved width in px, already clamped to the frame.
 */
export function writeLayoutPrefs(rightbar: number): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(layoutPersistence, JSON.stringify({ rightbar })) }
  catch (error) { console.error('Layout preference persistence failed:', error) }
}

/** Remove the persisted preferences; the next window starts from defaults. */
export function clearLayoutPrefs(): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.removeItem(layoutPersistence) }
  catch (_storageUnavailable) { /* The invalid prefs are still excluded from this window. */ }
}
