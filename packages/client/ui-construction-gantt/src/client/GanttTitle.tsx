/** Live chip title for the Gantt tab: the tab type name and active scenario label. */
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GanttTitleInjected } from './face.ts'
import type {} from './locales.ts'
import { scenarioTitle } from './gantt-adapter.ts'

/** Sidebar title share plus the schedule snapshot and localized copy. */
export type GanttTitleProps = PropsRuntime<'sidebar.right.pane.tab.title'> & PropsLocale<'constructionGantt'> & InjectFace<GanttTitleInjected>

/**
 * Render the tab chip title with the latest scenario it is showing.
 * @param props - Title seat shares, folded snapshot, and translated copy.
 * @returns the localized type name and active scenario label.
 */
export function GanttTitle({ useConstructionGantt, t }: GanttTitleProps): ReactNode {
  const snapshot = useConstructionGantt(value => value)
  const latest = snapshot.scenarios[0]
  return <>{latest === undefined ? t('title') : `${t('title')} · ${scenarioTitle(latest)}`}</>
}
