import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SKILLS = fileURLToPath(new URL('../assets/skills/', import.meta.url))

/** Expected templates per skill, in the order the SKILL.md fences appear. */
const EMBEDDED_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  'construction-cost': ['analysis-template.md', 'difference-template.md'],
  'construction-safety': ['issue-list-template.md'],
  'construction-quality': ['review-template.md'],
  'construction-schedule': ['scenario-template.md'],
}

/** Extract the inner text of every ```markdown fenced block, in order. */
function markdownBlocks(markdown: string): string[] {
  const blocks: string[] = []
  let current: string[] | undefined
  for (const line of markdown.split('\n')) {
    if (line.trim() === '```markdown') {
      current = []
      continue
    }
    if (line.trim() === '```' && current !== undefined) {
      blocks.push(`${current.join('\n')}\n`)
      current = undefined
      continue
    }
    if (current !== undefined) current.push(line)
  }
  expect(current, 'unterminated ```markdown fence').toBeUndefined()
  return blocks
}

describe('bundled skill templates', () => {
  for (const [skill, templates] of Object.entries(EMBEDDED_TEMPLATES)) {
    it(`${skill} embeds its templates byte-identically`, () => {
      const skillMarkdown = readFileSync(join(SKILLS, skill, 'SKILL.md'), 'utf8')
      const blocks = markdownBlocks(skillMarkdown)
      expect(blocks.length, `${skill} fence count`).toBe(templates.length)
      for (const [index, template] of templates.entries()) {
        const templateText = readFileSync(join(SKILLS, skill, 'templates', template), 'utf8')
        expect(blocks[index], `${skill} fence ${index + 1} vs templates/${template}`).toBe(templateText)
      }
    })
  }
})
