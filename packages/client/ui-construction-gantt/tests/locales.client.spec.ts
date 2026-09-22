/** Locale dictionary parity: en covers every zh key with the same placeholders. */
import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort()
}

describe('constructionGantt dictionaries', () => {
  it('gives en exactly the zh key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('uses the same placeholders on both sides', () => {
    for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(zh[key]))
    }
  })
})
