/** Host registration for the browser theme preference and pre-plugin palette. */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile } from '@deepseek-ai/cordis'
import type { ThemePreference, UiMode } from './theme-settings.ts'
import z from '@deepseek-ai/schemastery'

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { bootThemeInjections } from './boot-theme.ts'
import {
  DEFAULT_FONT_SIZE, DEFAULT_OUTPUT_DENOISE, DEFAULT_PREFERENCE, DEFAULT_UI_MODE,
  FONT_SIZE_MIN, FONT_SIZE_MAX, THEME_PREFERENCES, UI_MODES,
} from './theme-settings.ts'

export {
  DEFAULT_FONT_SIZE, DEFAULT_OUTPUT_DENOISE, DEFAULT_PREFERENCE, FONT_SIZE_FIELD, FONT_SIZE_MAX, FONT_SIZE_MIN,
  OUTPUT_DENOISE_ATTRIBUTE, OUTPUT_DENOISE_FIELD,
  THEME_PREFERENCE_FIELD, THEME_PREFERENCES, THEME_SETTINGS_NAMESPACE, UI_MODE_ATTRIBUTE, UI_MODE_FIELD,
  type ThemePreference, type ThemeSettings, type UiMode,
} from './theme-settings.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Browser palette preference. */
  preference: Volatile<ThemePreference>
  /** Browser font size in pixels. */
  fontSize: Volatile<number>
  /** Output-denoise Beta flag. */
  outputDenoise: Volatile<boolean>
  /** Presentation mode: business vs expert. */
  uiMode: Volatile<UiMode>
}

/** Live theme and typography preferences. */
export const Config = z.object({
  preference: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE).volatile(),
  fontSize: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE).volatile(),
  outputDenoise: z.boolean().default(DEFAULT_OUTPUT_DENOISE).volatile(),
  uiMode: z.union([...UI_MODES]).default(DEFAULT_UI_MODE).volatile(),
})

/** Supply the current palette before browser plugins start.
 * @param ctx Host plugin context.
 * @param config Validated live theme preferences.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  ctx.on('webserver/index-inject', (table) => {
    table.push(...bootThemeInjections(
      config.preference.get(), config.fontSize.get(), config.outputDenoise.get(), config.uiMode.get(),
    ))
  }, { prepend: true })
}
