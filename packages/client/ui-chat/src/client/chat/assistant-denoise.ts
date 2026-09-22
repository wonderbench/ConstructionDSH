/**
 * Pure prose-fold derivation for the output-denoise presentation: the fold
 * decision and the one-line conclusion are computed from the recorded message
 * text only. The conclusion is a verbatim slice of the model text (the trimmed
 * first non-empty line), never a generated summary, so a model claim such as
 * "圆满完成" can present as prose but can never upgrade any status display.
 */
import type { AssistantBlock } from '../contract/snapshot.ts'
import { assistantText } from './turn-assistant.ts'

/** Explanatory prose at or beyond this many non-empty lines folds (P9's 3-line threshold). */
export const DENOISE_FOLD_LINE_THRESHOLD = 3

/**
 * Count the non-empty lines of a text (lines whose trimmed value is not empty).
 * @param text - source text.
 * @returns the number of non-empty lines.
 */
export function nonEmptyLineCount(text: string): number {
  let count = 0
  for (const line of text.split('\n')) {
    if (line.trim() !== '') count += 1
  }
  return count
}

/**
 * First meaningful line of a text: the trimmed first non-empty line, a
 * verbatim contiguous slice of the source.
 * @param text - source text.
 * @returns the conclusion line, or null when the text carries no non-empty line.
 */
export function conclusionLine(text: string): string | null {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed !== '') return trimmed
  }
  return null
}

/** One settled fold decision: the conclusion line plus the fold state. */
export interface ProseFold {
  /** Verbatim first-line conclusion shown while folded. */
  readonly conclusion: string
}

/**
 * Decide whether one Assistant body folds under the denoise presentation:
 * only prose counts (reasoning has its own disclosure, images and tool-call
 * heads stay visible), and the prose must exceed the line threshold.
 * @param blocks - Assistant content blocks.
 * @returns the fold with its conclusion line, or null when nothing folds.
 */
export function proseFold(blocks: readonly AssistantBlock[]): ProseFold | null {
  const text = assistantText(blocks)
  const conclusion = conclusionLine(text)
  if (conclusion === null || nonEmptyLineCount(text) <= DENOISE_FOLD_LINE_THRESHOLD) return null
  return { conclusion }
}

/**
 * Blocks other than prose text: reasoning, images, tool-call heads, and
 * unknown blocks stay visible while prose folds.
 * @param blocks - Assistant content blocks.
 * @returns the non-text blocks in original order.
 */
export function nonProseBlocks(blocks: readonly AssistantBlock[]): readonly AssistantBlock[] {
  return blocks.filter(block => block.kind !== 'text')
}
