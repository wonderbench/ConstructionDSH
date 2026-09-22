/**
 * Right-Sidebar tab body for the read-only construction Gantt. The body owns
 * toolbar state (scenario, scale, fit, expand), picks the empty / calculating
 * / failure / chart state from the folded snapshot, and renders the chart with
 * the fixed name column; every string comes from the locale dictionary.
 */
import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, DisclosureRow, IconCompactOutlineRegular, IconFullscreenOutlineRegular, IconInfoOutlineRegular,
  IconQuestionOutlineRegular, IconRefreshOutlineRegular, IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleScenario } from './contract.ts'
import { GanttChart } from './GanttChart.tsx'
import type { GanttBodyInjected } from './face.ts'
import type {} from './locales.ts'
import { defaultViewMode, scenarioTitle, type GanttViewMode } from './gantt-adapter.ts'
import css from './GanttBody.module.css'

/** Standard sidebar owner share plus the schedule snapshot and localized copy. */
export type GanttBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'constructionGantt'> & InjectFace<GanttBodyInjected>

const VIEW_MODES: readonly GanttViewMode[] = ['Day', 'Week', 'Month']

function scenarioPartial(scenario: ScheduleScenario): boolean {
  return scenario.assumptions.length > 0 || scenario.unresolved.length > 0 || scenario.warnings.length > 0
}

/**
 * Render the Gantt tab body for the current Session.
 * @param props - Sidebar occurrence, folded schedule snapshot, and translated copy.
 * @returns the toolbar plus the state-appropriate chart or state view.
 */
export function GanttBody({ useTabInfo, useConstructionGantt, t }: GanttBodyProps): ReactNode {
  const { sidebar } = useTabInfo()
  const snapshot = useConstructionGantt(value => value)
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [modeOverride, setModeOverride] = useState<GanttViewMode | null>(null)
  const [fitNonce, setFitNonce] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [openSection, setOpenSection] = useState<string | null>(null)
  if (snapshot.scenarios.length === 0) {
    if (snapshot.running) {
      return <div className={css.state} role="status" data-state="calculating">{t('calculating')}</div>
    }
    const latestFailure = snapshot.failures[0]
    return (
      <div className={css.state} role={latestFailure === undefined ? 'status' : 'alert'} data-state={latestFailure === undefined ? 'empty' : 'failure'}>
        {latestFailure === undefined ? t('empty') : t(latestFailure.reason === 'error' ? 'failure.error' : 'failure.malformed')}
      </div>
    )
  }
  /* oxlint-disable-next-line typescript/no-non-null-assertion -- the empty-scenarios return above guarantees a first scenario. */
  const selected = snapshot.scenarios.find(scenario => scenario.resultId === selectedResultId) ?? snapshot.scenarios[0]!
  const mode = modeOverride ?? defaultViewMode(selected)
  const latestFailure = snapshot.failures[0]
  const toggleSection = (key: string): void => {
    setOpenSection(current => current === key ? null : key)
  }
  const sections = [
    {
      key: 'assumptions', label: t('partial.assumptions'),
      icon: <IconInfoOutlineRegular />, items: selected.assumptions,
    },
    {
      key: 'unresolved', label: t('partial.unresolved'),
      icon: <IconQuestionOutlineRegular />, items: selected.unresolved,
    },
    {
      key: 'warnings', label: t('partial.warnings'),
      icon: <IconWarningOutlineRegular />, items: selected.warnings,
    },
  ] as const
  const partial = scenarioPartial(selected)
  return (
    <div className={css.root} data-expanded={expanded ? 'true' : undefined}>
      <div className={css.toolbar}>
        <label className={css.scenarioField}>
          <span className={css.scenarioLabel}>{t('scenario.label')}</span>
          <select className={css.scenarioSelect} aria-label={t('scenario.label')}
            value={selected.resultId} onChange={(event) => { setSelectedResultId(event.target.value) }}>
            {snapshot.scenarios.map(scenario => (
              <option key={scenario.resultId} value={scenario.resultId}>{scenarioTitle(scenario)}</option>
            ))}
          </select>
        </label>
        <div className={css.scaleGroup} role="group" aria-label={t('scale.label')}>
          {VIEW_MODES.map(viewMode => (
            <Button key={viewMode} size="sm" variant={viewMode === mode ? 'primary' : 'ghost'}
              aria-pressed={viewMode === mode}
              onClick={() => { setModeOverride(viewMode) }}>
              {t(viewMode === 'Day' ? 'scale.day' : viewMode === 'Week' ? 'scale.week' : 'scale.month')}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" icon={<IconRefreshOutlineRegular />} aria-label={t('fit.aria')}
          title={t('fit.label')} onClick={() => { setFitNonce(value => value + 1) }} />
        {!sidebar.fullscreen && (
          <Button size="sm" variant="ghost" icon={<IconFullscreenOutlineRegular />} aria-label={t('expand.aria')}
            title={t('expand.enter')} onClick={() => { setExpanded(true) }} />
        )}
      </div>
      {snapshot.running && <div className={css.banner} role="status">{t('banner.running')}</div>}
      {latestFailure !== undefined && (
        <div className={css.banner} role="alert">
          {t('banner.failure', { reason: t(latestFailure.reason === 'error' ? 'failure.error' : 'failure.malformed') })}
        </div>
      )}
      {partial && (
        <div className={css.partial}>
          {sections.map((section) => {
            if (section.items.length === 0) return null
            const open = openSection === section.key
            return (
              <DisclosureRow key={section.key} icon={section.icon}
                title={t('partial.entry', { label: section.label, count: section.items.length })}
                open={open} expandable onToggle={() => { toggleSection(section.key) }}>
                <ul className={css.partialList}>
                  {section.items.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </DisclosureRow>
            )
          })}
        </div>
      )}
      <div className={clsx(css.chartSection, expanded && css.chartExpanded)}>
        {expanded && (
          <Button className={css.exitExpand} size="sm" variant="outline" icon={<IconCompactOutlineRegular />}
            aria-label={t('expand.aria')} title={t('expand.exit')}
            onClick={() => { setExpanded(false) }}>
            {t('expand.exit')}
          </Button>
        )}
        <GanttChart scenario={selected} mode={mode} fitNonce={fitNonce}
          copy={{ columnTitle: t('column.tasks'), expandLabel: t('name.expand'), collapseLabel: t('name.collapse') }} />
      </div>
      <p className={css.hint}>{t('readonly.hint')}</p>
    </div>
  )
}
