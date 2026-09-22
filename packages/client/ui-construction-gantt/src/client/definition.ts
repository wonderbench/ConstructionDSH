/**
 * Conversation event Definition and view target that fold
 * `construction_schedule_present` tool results into one per-Session schedule
 * snapshot. The fold runs through the standard Conversation assembly, so the
 * snapshot replays deterministically from the Session log and a Session
 * switch never mixes another Session's scenarios.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationMatch, ConversationNodeDefinition, ConversationStartMatch, ConversationViewBuilder,
  ConversationViewDefinition, ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ScheduleFailure, ScheduleFailureReason, ScheduleResultData, ScheduleScenario } from './contract.ts'
import { EMPTY_CONSTRUCTION_GANTT_SNAPSHOT } from './contract.ts'
import { SCHEDULE_PRESENT_TOOL, parseScheduleResult, resultText } from './schedule-result.ts'
import type { ConstructionGanttSnapshot } from './contract.ts'

/** Definition kind of one schedule-presentation call context. */
export const SCHEDULE_RESULT_KIND = 'construction-schedule-result'

/** View target owned by this package's Conversation assembly. */
export const CONSTRUCTION_GANTT_TARGET = 'constructionGantt'

/** Discriminated payload carried by this Definition's view nodes. */
export type ConstructionGanttNodeData =
  | { readonly kind: 'schedule-running'; readonly callId: string }
  | { readonly kind: 'schedule-result'; readonly callId: string; readonly result: ScheduleResultData }
  | { readonly kind: 'schedule-failure'; readonly callId: string; readonly reason: ScheduleFailureReason }

/** View node materialized for one schedule-presentation call context. */
export interface ConstructionGanttViewNode extends ConversationViewNode {
  /** Sequence anchoring this node in the Session log. */
  readonly anchorSeq: number
  /** Folded outcome of the call. */
  readonly data: ConstructionGanttNodeData
}

/** Outcome folded from a completed tool result; absent while the call is open. */
export type ScheduleOutcome =
  | { readonly kind: 'result'; readonly result: ScheduleResultData }
  | { readonly kind: 'failure'; readonly reason: ScheduleFailureReason }

/** State of one schedule-presentation call context. */
export interface ScheduleResultState {
  /** Call identity shared by the `tool/call` start and its `tool/result`. */
  readonly callId: string
  /** Folded result; `undefined` while the call has no result yet. */
  readonly outcome: ScheduleOutcome | undefined
}

function outcomeFrom(match: ConversationMatch, state: ScheduleResultState): ScheduleResultState {
  const event = match.event
  if (event.type !== 'tool/result') return state
  if (event.data.error !== undefined) {
    return { ...state, outcome: { kind: 'failure', reason: 'error' } }
  }
  const parsed = parseScheduleResult(resultText(event.data.message.content) ?? '')
  return {
    ...state,
    outcome: parsed === undefined
      ? { kind: 'failure', reason: 'malformed' }
      : { kind: 'result', result: parsed },
  }
}

function startCallId(event: ConversationStartMatch['event']): string {
  return event.type === 'tool/call' ? String(event.data.callId) : ''
}

/** One schedule-presentation call lifecycle: call start, then one result. */
export const scheduleResultDefinition: ConversationNodeDefinition<ScheduleResultState> = {
  kind: SCHEDULE_RESULT_KIND,
  target: CONSTRUCTION_GANTT_TARGET,
  match: (event) => {
    if (event.type === 'tool/call' && event.data.name === SCHEDULE_PRESENT_TOOL) {
      return { id: String(event.data.callId), role: 'start' }
    }
    if (event.type === 'tool/result') {
      return { id: String(event.data.message.source.callId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => ({ callId: startCallId(match.event), outcome: undefined }),
  update: (context, match) => outcomeFrom(match, context.state),
  buildViewNode: (context) => {
    const state = context.state
    if (state === undefined) return null
    const { callId, outcome } = state
    const data: ConstructionGanttNodeData = outcome === undefined
      ? { kind: 'schedule-running', callId }
      : outcome.kind === 'result'
        ? { kind: 'schedule-result', callId, result: outcome.result }
        : { kind: 'schedule-failure', callId, reason: outcome.reason }
    return {
      key: context.key,
      kind: context.kind,
      id: context.id,
      target: CONSTRUCTION_GANTT_TARGET,
      anchorSeq: context.start?.event.seq ?? context.matches[context.matches.length - 1]?.event.seq ?? 0,
      data,
    }
  },
}

/** Incremental per-Session reducer from view nodes to the Gantt snapshot. */
export class ConstructionGanttSnapshotBuilder implements ConversationViewBuilder<
  ConstructionGanttViewNode, ConstructionGanttSnapshot
> {
  readonly empty = EMPTY_CONSTRUCTION_GANTT_SNAPSHOT
  private nodes = new Map<string, ConstructionGanttViewNode>()

  replace(input: { readonly nodes: readonly ConstructionGanttViewNode[] }): ConstructionGanttSnapshot {
    this.nodes = new Map(input.nodes.map(node => [node.key, node]))
    return this.snapshot()
  }

  apply(input: { readonly upserts: readonly ConstructionGanttViewNode[] }): ConstructionGanttSnapshot {
    for (const node of input.upserts) this.nodes.set(node.key, node)
    return this.snapshot()
  }

  private snapshot(): ConstructionGanttSnapshot {
    const ordered = [...this.nodes.values()].sort((left, right) => left.anchorSeq - right.anchorSeq)
    const byResultId = new Map<string, ScheduleScenario>()
    const failures: ScheduleFailure[] = []
    for (const node of ordered) {
      switch (node.data.kind) {
        case 'schedule-result':
          // Ascending anchor order makes the last occurrence the newest.
          byResultId.set(node.data.result.resultId, { ...node.data.result, seq: node.anchorSeq })
          break
        case 'schedule-failure':
          failures.push({
            callId: node.data.callId,
            reason: node.data.reason,
            seq: node.anchorSeq,
          })
          break
        case 'schedule-running':
          break
      }
    }
    failures.sort((left, right) => right.seq - left.seq)
    const scenarios = [...byResultId.values()].sort((left, right) => right.seq - left.seq)
    const latest = ordered[ordered.length - 1]
    return {
      scenarios,
      failures,
      running: latest !== undefined && latest.data.kind === 'schedule-running',
    }
  }
}

/** View target definition creating one reducer per Session. */
export const constructionGanttViewDefinition: ConversationViewDefinition<
  ConstructionGanttViewNode, ConstructionGanttSnapshot
> = {
  target: CONSTRUCTION_GANTT_TARGET,
  create: () => new ConstructionGanttSnapshotBuilder(),
}

/**
 * Register the schedule-result Definition and the Gantt view target.
 * @param ctx - Plugin context receiving the Conversation registries.
 */
export function registerConstructionScheduleDefinition(ctx: Context): void {
  ctx.effect(() => ctx.uiConversation.events.register(scheduleResultDefinition), 'ui-construction-gantt: schedule definition')
  ctx.effect(() => ctx.uiConversation.views.register(constructionGanttViewDefinition), 'ui-construction-gantt: gantt view target')
}
