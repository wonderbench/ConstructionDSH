/**
 * Interface typography roles (typography.css), asserted against the CSS text:
 * every role pair is declared on `:root` as px sizes with matching line
 * heights, sizes step down strictly, and no size sits below the caption floor.
 * The roles are declaration-only until surfaces adopt them, so this test
 * pins the contract without asserting any consumer.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRules } from './stylesheet-scan.ts'

const sheetCss = readFileSync(
  fileURLToPath(new URL('../src/styles/typography.css', import.meta.url)), 'utf8')

/** Role names in strict descending size order. */
const ROLES = ['strong', 'base', 'secondary', 'caption'] as const

describe('interface typography roles', () => {
  const declarations = new Map(parseRules(sheetCss)
    .filter(rule => rule.selectors.length === 1 && rule.selectors[0] === ':root')
    .flatMap(rule => rule.declarations))

  it('declares every role pair on :root only', () => {
    for (const role of ROLES) {
      expect(declarations.get(`--dsw-ui-font-${role}`), role).toMatch(/^\d+px$/)
      expect(declarations.get(`--dsw-ui-line-${role}`), role).toMatch(/^\d+px$/)
    }
  })

  it('steps sizes down strictly from strong to caption', () => {
    const sizes = ROLES.map(role => Number.parseInt(declarations.get(`--dsw-ui-font-${role}`)!, 10))
    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]!, `${ROLES[index]}`).toBeLessThan(sizes[index - 1]!)
    }
  })

  it('keeps every line height at or above its size', () => {
    for (const role of ROLES) {
      const size = Number.parseInt(declarations.get(`--dsw-ui-font-${role}`)!, 10)
      const line = Number.parseInt(declarations.get(`--dsw-ui-line-${role}`)!, 10)
      expect(line, role).toBeGreaterThanOrEqual(size)
    }
  })
})
