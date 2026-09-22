/** Appearance, font-size, output-denoise, and interface-mode row stores: snapshot-mirror actions and the revision guards. */
import { describe, expect, it } from 'vitest'
import { createAppearanceRowStore, createFontSizeRowStore, createOutputDenoiseRowStore, createUiModeRowStore } from '../src/client/settings-store.ts'

describe('createAppearanceRowStore', () => {
  it('init shape: system preference with revision at -1', () => {
    const store = createAppearanceRowStore().create()
    expect(store.getSnapshot()).toEqual({ preference: 'system', revision: -1 })
  })

  it('sync mirrors the preference and advances the revision', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync('dark', 0)
    expect(store.getSnapshot()).toEqual({ preference: 'dark', revision: 0 })
    store.actions.sync('light', 2)
    expect(store.getSnapshot().preference).toBe('light')
    expect(store.getSnapshot().revision).toBe(2)
  })

  it('revision guard drops stale and duplicate writes', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync('dark', 3)
    store.actions.sync('system', 2)
    store.actions.sync('system', 3)
    expect(store.getSnapshot().preference).toBe('dark')
    expect(store.getSnapshot().revision).toBe(3)
  })
})

describe('createFontSizeRowStore', () => {
  it('init shape: default size with revision at -1', () => {
    const store = createFontSizeRowStore().create()
    expect(store.getSnapshot()).toEqual({ fontSize: 14, revision: -1 })
  })

  it('sync mirrors the size; the revision guard drops stale and duplicate writes', () => {
    const store = createFontSizeRowStore().create()
    store.actions.sync(16, 3)
    expect(store.getSnapshot()).toEqual({ fontSize: 16, revision: 3 })
    store.actions.sync(12, 2)
    store.actions.sync(12, 3)
    expect(store.getSnapshot().fontSize).toBe(16)
    expect(store.getSnapshot().revision).toBe(3)
  })
})

describe('createOutputDenoiseRowStore', () => {
  it('init shape: off with revision at -1', () => {
    const store = createOutputDenoiseRowStore().create()
    expect(store.getSnapshot()).toEqual({ enabled: false, revision: -1 })
  })

  it('sync mirrors the flag; the revision guard drops stale and duplicate writes', () => {
    const store = createOutputDenoiseRowStore().create()
    store.actions.sync(true, 2)
    expect(store.getSnapshot()).toEqual({ enabled: true, revision: 2 })
    store.actions.sync(false, 1)
    store.actions.sync(false, 2)
    expect(store.getSnapshot().enabled).toBe(true)
    expect(store.getSnapshot().revision).toBe(2)
  })
})

describe('createUiModeRowStore', () => {
  it('init shape: business mode with revision at -1', () => {
    const store = createUiModeRowStore().create()
    expect(store.getSnapshot()).toEqual({ mode: 'business', revision: -1 })
  })

  it('sync mirrors the mode; the revision guard drops stale and duplicate writes', () => {
    const store = createUiModeRowStore().create()
    store.actions.sync('expert', 2)
    expect(store.getSnapshot()).toEqual({ mode: 'expert', revision: 2 })
    store.actions.sync('business', 1)
    store.actions.sync('business', 2)
    expect(store.getSnapshot().mode).toBe('expert')
    expect(store.getSnapshot().revision).toBe(2)
  })
})
