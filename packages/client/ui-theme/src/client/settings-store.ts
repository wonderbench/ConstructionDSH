/**
 * Appearance and font-size row slot stores: mirrors of the theme service
 * snapshot. The plugin's apply-world change listener is the only writer; the
 * row components read via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import { DEFAULT_FONT_SIZE, DEFAULT_OUTPUT_DENOISE, DEFAULT_UI_MODE, type ThemePreference, type UiMode } from '../theme-settings.ts'

/** Store state mirrored from the theme snapshot. */
export interface AppearanceRowState {
  /** Persisted preference (selection state reads this, never the resolved active theme). */
  preference: ThemePreference
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type AppearanceRowActions = {
  sync: (draft: AppearanceRowState, preference: ThemePreference, revision: number) => void
}

/**
 * Declares the Appearance row state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore(): EngineStoreHandle<AppearanceRowState, AppearanceRowActions> {
  return defineStore({
    init: (): AppearanceRowState => ({ preference: 'system', revision: -1 }),
    actions: {
      sync: (d, preference: ThemePreference, revision: number) => {
        if (revision <= d.revision) return
        d.preference = preference
        d.revision = revision
      },
    },
  })
}

/** Store state mirrored from the theme snapshot's font size. */
export interface FontSizeRowState {
  /** Persisted content font size in px. */
  fontSize: number
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Store state mirrored from the theme snapshot's output-denoise Beta flag. */
export interface OutputDenoiseRowState {
  /** Persisted output-denoise flag. */
  enabled: boolean
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type FontSizeRowActions = {
  sync: (draft: FontSizeRowState, fontSize: number, revision: number) => void
}

/**
 * Declares the font-size row state and write surface.
 * @returns the store handle.
 */
export function createFontSizeRowStore(): EngineStoreHandle<FontSizeRowState, FontSizeRowActions> {
  return defineStore({
    init: (): FontSizeRowState => ({ fontSize: DEFAULT_FONT_SIZE, revision: -1 }),
    actions: {
      sync: (d, fontSize: number, revision: number) => {
        if (revision <= d.revision) return
        d.fontSize = fontSize
        d.revision = revision
      },
    },
  })
}

/** Declared action shape giving the exported factory a stable return type. */
type OutputDenoiseRowActions = {
  sync: (draft: OutputDenoiseRowState, enabled: boolean, revision: number) => void
}

/**
 * Declares the output-denoise row state and write surface.
 * @returns the store handle.
 */
export function createOutputDenoiseRowStore(): EngineStoreHandle<OutputDenoiseRowState, OutputDenoiseRowActions> {
  return defineStore({
    init: (): OutputDenoiseRowState => ({ enabled: DEFAULT_OUTPUT_DENOISE, revision: -1 }),
    actions: {
      sync: (d, enabled: boolean, revision: number) => {
        if (revision <= d.revision) return
        d.enabled = enabled
        d.revision = revision
      },
    },
  })
}

/** Store state mirrored from the theme snapshot's presentation mode. */
export interface UiModeRowState {
  /** Persisted presentation mode. */
  mode: UiMode
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type UiModeRowActions = {
  sync: (draft: UiModeRowState, mode: UiMode, revision: number) => void
}

/**
 * Declares the interface-mode row state and write surface.
 * @returns the store handle.
 */
export function createUiModeRowStore(): EngineStoreHandle<UiModeRowState, UiModeRowActions> {
  return defineStore({
    init: (): UiModeRowState => ({ mode: DEFAULT_UI_MODE, revision: -1 }),
    actions: {
      sync: (d, mode: UiMode, revision: number) => {
        if (revision <= d.revision) return
        d.mode = mode
        d.revision = revision
      },
    },
  })
}
