/** Injected faces and slot-facing declaration merging for the Gantt tab. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConstructionGanttSnapshot } from './contract.ts'

/** Schedule snapshot source bound by the plugin's Conversation fold. */
export interface GanttBodyInjected {
  readonly hooks: { readonly constructionGantt: HostObservable<ConstructionGanttSnapshot> }
}

/** Live title seat reads the same snapshot to name the active scenario. */
export interface GanttTitleInjected {
  readonly hooks: { readonly constructionGantt: HostObservable<ConstructionGanttSnapshot> }
}
