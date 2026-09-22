// @vitest-environment jsdom
/** readUiMode: the context-free document reader every non-React consumer uses. */
import { afterEach, describe, expect, it } from 'vitest'
import { readUiMode } from '../src/client/ui-mode.ts'

const UI_MODE_ATTRIBUTE = 'data-dsw-ui-mode'

afterEach(() => {
  document.body.removeAttribute(UI_MODE_ATTRIBUTE)
})

describe('readUiMode', () => {
  it('reads business and expert from the body attribute', () => {
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'expert')
    expect(readUiMode()).toBe('expert')
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'business')
    expect(readUiMode()).toBe('business')
  })

  it('falls back to business when the attribute is absent or unrecognized', () => {
    expect(readUiMode()).toBe('business')
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'kiosk')
    expect(readUiMode()).toBe('business')
  })
})
