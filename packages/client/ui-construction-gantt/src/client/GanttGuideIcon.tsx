/** Guide-entry glyph: three timeline bars on a baseline, drawn in currentColor. */
import type { ReactNode } from 'react'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Render the Gantt guide icon.
 * @param props - Square edge and optional class; color rides currentColor.
 * @returns the timeline glyph.
 */
export function GanttGuideIcon({ size = 26, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M4 6v16h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="7" y="9" width="9" height="3.4" rx="1.2" fill="currentColor" />
      <rect x="7" y="14.4" width="13" height="3.4" rx="1.2" fill="currentColor" opacity="0.55" />
      <path d="M19.5 9.7 21.6 12l-2.1 2.3L17.4 12Z" fill="currentColor" />
    </svg>
  )
}
