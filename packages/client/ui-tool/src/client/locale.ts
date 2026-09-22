/** Locale namespaces supplied to Tool renderers. */

/** Locale namespace supplied by the conversation owner to Tool renderers. */
export const CONVERSATION_NS = 'conversation'

/**
 * Tool-owned namespace for the output-denoise technical-details layer. The
 * conversation namespace stays with its owner; this small dictionary carries
 * only the denoise layering copy.
 */
export const TOOL_NS = 'tool'

/** Simplified Chinese dictionary and key-set source of truth. */
export const toolZh = {
  'technicalDetails.title': '技术详情',
  'technicalDetails.expand': '展开技术详情',
  'technicalDetails.collapse': '收起技术详情',
} satisfies Record<string, string>

/** Tool dictionary key union. */
export type ToolKey = keyof typeof toolZh

/** English dictionary, checked against the Chinese key set. */
export const toolEn = {
  'technicalDetails.title': 'Technical details',
  'technicalDetails.expand': 'Expand technical details',
  'technicalDetails.collapse': 'Collapse technical details',
} satisfies Record<ToolKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Tool-owned denoise layering copy (technical-details disclosure). */
    tool: ToolKey
  }
}
