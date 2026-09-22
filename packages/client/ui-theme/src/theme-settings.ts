/** Theme preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Built-in preferences accepted at the registry and settings boundaries. */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

/** Settings namespace owned by the theme plugin. */
export const THEME_SETTINGS_NAMESPACE = 'ui-theme'

/** Field carrying the selected built-in theme preference. */
export const THEME_PREFERENCE_FIELD = 'preference'

/** Field carrying the conversation content font size. */
export const FONT_SIZE_FIELD = 'fontSize'

/** Field carrying the output-denoise Beta flag. */
export const OUTPUT_DENOISE_FIELD = 'outputDenoise'

/** Body attribute publishing the output-denoise flag to the document. */
export const OUTPUT_DENOISE_ATTRIBUTE = 'data-dsw-output-denoise'

/** Presentation modes accepted at the registry and settings boundaries. */
export const UI_MODES = ['business', 'expert'] as const

/** Field carrying the presentation mode (business workbench vs expert workspace). */
export const UI_MODE_FIELD = 'uiMode'

/** Body attribute publishing the presentation mode to the document. */
export const UI_MODE_ATTRIBUTE = 'data-dsw-ui-mode'

/** Theme preference persisted by the product Appearance row. */
export type ThemePreference = typeof THEME_PREFERENCES[number]

/** Presentation mode persisted by the interface-mode row. */
export type UiMode = typeof UI_MODES[number]

/** Default preference when the user-settings document has no override. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system'

/** Smallest accepted content font size (px). */
export const FONT_SIZE_MIN = 12

/** Largest accepted content font size (px). */
export const FONT_SIZE_MAX = 17

/** Content font size when the user-settings document has no override (px). */
export const DEFAULT_FONT_SIZE = 14

/** Output-denoise flag when the user-settings document has no override (Beta: off). */
export const DEFAULT_OUTPUT_DENOISE = false

/** Presentation mode when the user-settings document has no override. */
export const DEFAULT_UI_MODE: UiMode = 'business'

/** Durable theme section shared by the Host schema and the browser scope. */
export interface ThemeSettings {
  /** Selected built-in preference. */
  preference: ThemePreference
  /** Conversation content font size in px (integer within {@link FONT_SIZE_MIN}..{@link FONT_SIZE_MAX}). */
  fontSize: number
  /**
   * Output-denoise Beta flag: when on, consumers may fold explanatory model
   * prose and layer technical fields behind details. Presentation-only; the
   * default stays off until the behavior graduates from Beta.
   */
  outputDenoise: boolean
  /**
   * Presentation mode: `business` (default) emphasizes projects, deliverables,
   * and pending confirmations; `expert` keeps every technical surface visible.
   * Presentation-only — it never changes features, permissions, or what the
   * model sees; an absent value reads as `business`.
   */
  uiMode: UiMode
}

/** Durable theme schema; also the wire envelope the browser scope validates against. */
export const ThemeSettingsSchema: z<ThemeSettings> = z.object({
  [THEME_PREFERENCE_FIELD]: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE),
  [FONT_SIZE_FIELD]: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE),
  [OUTPUT_DENOISE_FIELD]: z.boolean().default(DEFAULT_OUTPUT_DENOISE),
  [UI_MODE_FIELD]: z.union([...UI_MODES]).default(DEFAULT_UI_MODE),
})

/**
 * Narrow one wire or registry value to a persistable preference.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in preference.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some(preference => preference === value)
}

/**
 * Narrow one wire or body-attribute value to a presentation mode.
 * @param value - value crossing the settings or document boundary.
 * @returns whether the value is a known presentation mode.
 */
export function isUiMode(value: unknown): value is UiMode {
  return UI_MODES.some(mode => mode === value)
}
