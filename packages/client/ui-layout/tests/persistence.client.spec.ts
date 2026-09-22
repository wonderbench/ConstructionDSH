// @vitest-environment jsdom
/** The right panel width is the one layout preference that crosses a reload. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createLayoutStore } from '../src/client/stores.ts'
import { layoutPersistence } from '../src/client/persistence.ts'

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1920)
  localStorage.clear()
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('restores the saved width on a new window instance and keeps it across close and reopen', () => {
  const first = createLayoutStore().create()
  first.actions.openRightbar(true, false)
  first.actions.setRightbar(720)
  expect(JSON.parse(localStorage.getItem(layoutPersistence)!)).toEqual({ rightbar: 720 })
  const reloaded = createLayoutStore().create()
  expect(reloaded.store.getSnapshot().layoutInfo.rightbar).toBe(720)
  // The restored preference is the first-opening preference: close and reopen keep it.
  reloaded.actions.openRightbar(true, false)
  reloaded.actions.closeRightbar()
  reloaded.actions.openRightbar(true, false)
  expect(reloaded.store.getSnapshot().layoutInfo.rightbar).toBe(720)
})

it('adopts the saved width through the drag-clamped write entry', () => {
  localStorage.setItem(layoutPersistence, JSON.stringify({ rightbar: 4000 }))
  const { store } = createLayoutStore().create()
  // 4000 exceeds 70% of the 1920px frame, so adoption re-clamps to 1344.
  expect(store.getSnapshot().layoutInfo.rightbar).toBe(1344)
})

it('writes when the width appears or changes, not for frame measurements or presentation reports', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem')
  const { actions } = createLayoutStore().create()
  // The first opening materializes the preference (45% of the frame) and persists it.
  actions.openRightbar(true, false)
  expect(write).toHaveBeenCalledTimes(1)
  actions.setViewportWidth(1000)
  expect(write).toHaveBeenCalledTimes(1)
  actions.setRightbar(640)
  expect(write).toHaveBeenCalledTimes(2)
  actions.closeRightbar()
  actions.openRightbar(false, true)
  expect(write).toHaveBeenCalledTimes(2)
  expect(JSON.parse(localStorage.getItem(layoutPersistence)!)).toEqual({ rightbar: 640 })
})

it('falls back silently to the first-open default when stored JSON is corrupt or mismatched', () => {
  localStorage.setItem(layoutPersistence, '{broken')
  expect(createLayoutStore().create().store.getSnapshot().layoutInfo.rightbar).toBeNull()
  expect(localStorage.getItem(layoutPersistence)).toBeNull()
  localStorage.setItem(layoutPersistence, JSON.stringify({ rightbar: 'wide' }))
  expect(createLayoutStore().create().store.getSnapshot().layoutInfo.rightbar).toBeNull()
  localStorage.setItem(layoutPersistence, JSON.stringify({ rightbar: -20 }))
  expect(createLayoutStore().create().store.getSnapshot().layoutInfo.rightbar).toBeNull()
})

it('keeps the layout usable in memory when storage rejects writes', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { store, actions } = createLayoutStore().create()
  actions.openRightbar(true, false)
  actions.setRightbar(700)
  expect(store.getSnapshot().layoutInfo.rightbar).toBe(700)
})
