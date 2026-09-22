/** Schedule-result Conversation Definition and snapshot builder behavior. */
import { describe, expect, it } from 'vitest'
import type { ConversationMatch, ConversationNodeContext } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { ScheduleResultState } from '../src/client/definition.ts'
import {
  CONSTRUCTION_GANTT_TARGET, ConstructionGanttSnapshotBuilder, constructionGanttViewDefinition,
  SCHEDULE_RESULT_KIND, scheduleResultDefinition,
} from '../src/client/definition.ts'
import type { ConstructionGanttNodeData, ConstructionGanttViewNode } from '../src/client/definition.ts'
import { callEvent, makeResultText, makeScheduleResult, resultEvent } from './fixtures.client.ts'

type State = ScheduleResultState
type LiveContext = ConversationNodeContext<State> & { readonly state: State }

function asEvent(entry: Record<string, unknown>): SessionEvent {
  return entry as unknown as SessionEvent
}

function asLike(entry: Record<string, unknown>): SessionEventLike {
  return entry as unknown as SessionEventLike
}

function updateMatch(entry: Record<string, unknown>): ConversationMatch {
  return { event: asLike(entry), role: 'update', location: { kind: 'session' } }
}

function state(callId: string, outcome?: State['outcome']): State {
  return { callId, outcome }
}

function nodeContext(current: State, startSeq?: number): ConversationNodeContext<State> {
  return {
    key: `9:${SCHEDULE_RESULT_KIND}${current.callId}`,
    kind: SCHEDULE_RESULT_KIND,
    id: current.callId,
    state: current,
    matches: [],
    current: new Map(),
    start: startSeq === undefined ? undefined : { event: asEvent(callEvent(current.callId, startSeq)), role: 'start', location: { kind: 'session' } },
  } as unknown as ConversationNodeContext<State>
}

function liveContext(current: State): LiveContext {
  return nodeContext(current) as LiveContext
}

/** Materialize one view node with the package's extended node type. */
function buildNode(context: ConversationNodeContext<State>): ConstructionGanttViewNode | null {
  const definition = scheduleResultDefinition
  if (definition.buildViewNode === undefined) {
    throw new Error('scheduleResultDefinition declares no buildViewNode')
  }
  return definition.buildViewNode(context) as ConstructionGanttViewNode | null
}

describe('scheduleResultDefinition.match', () => {
  it('starts a context for a schedule presentation call', () => {
    expect(scheduleResultDefinition.match(asLike(callEvent('c1', 1))))
      .toEqual({ id: 'c1', role: 'start' })
  })

  it('ignores calls for other tools', () => {
    const base = callEvent('c1', 1)
    const event = { ...base, data: { ...base.data as Record<string, unknown>, name: 'other_tool' } }
    expect(scheduleResultDefinition.match(asLike(event))).toBeNull()
  })

  it('updates the matching call context for every tool result', () => {
    expect(scheduleResultDefinition.match(asLike(resultEvent('c1', 2, '{}'))))
      .toEqual({ id: 'c1', role: 'update' })
  })

  it('ignores unrelated event types', () => {
    expect(scheduleResultDefinition.match(asLike({ seq: 1, time: 1, type: 'user/message', data: {} }))).toBeNull()
  })
})

describe('scheduleResultDefinition lifecycle', () => {
  it('starts from the call identity without an outcome', () => {
    const startMatch = { event: asEvent(callEvent('c1', 1)), role: 'start', location: { kind: 'session' } } as const
    expect(scheduleResultDefinition.start(nodeContext(state('c1')), startMatch, undefined as never))
      .toEqual({ callId: 'c1', outcome: undefined })
  })

  it('starts with an empty identity when the start event is not a tool call', () => {
    const startMatch = { event: asEvent({ seq: 1, time: 1, type: 'user/message', data: {} }), role: 'start', location: { kind: 'session' } } as const
    expect(scheduleResultDefinition.start(nodeContext(state('c1')), startMatch, undefined as never))
      .toEqual({ callId: '', outcome: undefined })
  })

  it('publishes no node while the context has no state', () => {
    const context = { ...nodeContext(state('c1')), state: undefined } as never
    expect(buildNode(context)).toBeNull()
  })

  it('folds a valid result into a scenario outcome', () => {
    const next = scheduleResultDefinition.update(liveContext(state('c1')), updateMatch(resultEvent('c1', 2, makeResultText())))
    expect(next.outcome?.kind).toBe('result')
  })

  it('folds malformed result text into a malformed failure', () => {
    const next = scheduleResultDefinition.update(liveContext(state('c1')), updateMatch(resultEvent('c1', 2, '{"schemaVersion":2}')))
    expect(next.outcome).toEqual({ kind: 'failure', reason: 'malformed' })
  })

  it('folds a flagged result error into an error failure', () => {
    const next = scheduleResultDefinition.update(liveContext(state('c1')), updateMatch(resultEvent('c1', 2, makeResultText(), true)))
    expect(next.outcome).toEqual({ kind: 'failure', reason: 'error' })
  })

  it('folds a top-level result error into an error failure', () => {
    const event = resultEvent('c1', 2, makeResultText())
    event.data = { ...event.data as Record<string, unknown>, error: { name: 'Failed', code: 'failed' } }
    const next = scheduleResultDefinition.update(liveContext(state('c1')), updateMatch(event))
    expect(next.outcome).toEqual({ kind: 'failure', reason: 'error' })
  })

  it('folds a non-text result block into a malformed failure', () => {
    const imageOnly = resultEvent('c1', 2, makeResultText())
    ;(imageOnly.data as { message: { content: Record<string, unknown>[] } }).message.content[0] = { type: 'image' }
    expect(scheduleResultDefinition.update(liveContext(state('c1')), updateMatch(imageOnly)).outcome)
      .toEqual({ kind: 'failure', reason: 'malformed' })
  })

  it('keeps the state for a non-result update', () => {
    const current = state('c1')
    const next = scheduleResultDefinition.update(liveContext(current), updateMatch(callEvent('c1', 1)))
    expect(next).toBe(current)
  })

  it('builds a running node before the result arrives', () => {
    const node = buildNode(nodeContext(state('c1'), 1))
    expect(node).toMatchObject({
      kind: SCHEDULE_RESULT_KIND,
      id: 'c1',
      target: CONSTRUCTION_GANTT_TARGET,
      anchorSeq: 1,
      data: { kind: 'schedule-running', callId: 'c1' },
    })
  })

  it('builds result and failure nodes from the folded outcome', () => {
    const result = makeScheduleResult()
    const resultNode = buildNode(
      nodeContext({ callId: 'c1', outcome: { kind: 'result', result } }, 1),
    )
    expect(resultNode?.data).toEqual({ kind: 'schedule-result', callId: 'c1', result })
    const failureNode = buildNode(
      nodeContext({ callId: 'c1', outcome: { kind: 'failure', reason: 'malformed' } }, 1),
    )
    expect(failureNode?.data).toEqual({ kind: 'schedule-failure', callId: 'c1', reason: 'malformed' })
  })

  it('falls back to the last match sequence without a start match', () => {
    const context = {
      ...nodeContext(state('c1')),
      start: undefined,
      matches: [{ event: asLike(resultEvent('c1', 7, '{}')), role: 'update', location: { kind: 'session' } }],
    } as never
    const node = buildNode(context)
    expect(node?.anchorSeq).toBe(7)
  })

  it('anchors at sequence zero when neither a start nor a match exists', () => {
    const context = { ...nodeContext(state('c1')), start: undefined, matches: [] } as never
    expect(buildNode(context)?.anchorSeq).toBe(0)
  })
})

describe('ConstructionGanttSnapshotBuilder', () => {
  function node(data: ConstructionGanttNodeData, anchorSeq: number): ConstructionGanttViewNode {
    return {
      key: `k${anchorSeq}`,
      kind: SCHEDULE_RESULT_KIND,
      id: `call-${anchorSeq}`,
      target: CONSTRUCTION_GANTT_TARGET,
      anchorSeq,
      data,
    }
  }

  function resultNode(seq: number, resultId = `r${seq}`): ConstructionGanttViewNode {
    return node({ kind: 'schedule-result', callId: `call-${seq}`, result: makeScheduleResult({ resultId }) }, seq)
  }

  it('exposes the empty snapshot before any node', () => {
    const builder = new ConstructionGanttSnapshotBuilder()
    expect(builder.empty).toEqual({ scenarios: [], failures: [], running: false })
    expect(builder.replace({ nodes: [] })).toEqual(builder.empty)
  })

  it('keeps scenarios latest-first and deduplicates by result id', () => {
    const builder = new ConstructionGanttSnapshotBuilder()
    const snapshot = builder.replace({
      nodes: [resultNode(1, 'same'), resultNode(2, 'same'), resultNode(3, 'other')],
    })
    expect(snapshot.scenarios.map(scenario => scenario.resultId)).toEqual(['other', 'same'])
    expect(snapshot.scenarios.find(scenario => scenario.resultId === 'same')?.seq).toBe(2)
    expect(snapshot.running).toBe(false)
  })

  it('applies upserts incrementally and keeps failures latest-first', () => {
    const builder = new ConstructionGanttSnapshotBuilder()
    builder.replace({ nodes: [resultNode(1)] })
    const snapshot = builder.apply({
      upserts: [
        node({ kind: 'schedule-failure', callId: 'call-2', reason: 'malformed' }, 2),
        node({ kind: 'schedule-failure', callId: 'call-3', reason: 'error' }, 3),
      ],
    })
    expect(snapshot.scenarios.map(scenario => scenario.resultId)).toEqual(['r1'])
    expect(snapshot.failures.map(failure => failure.reason)).toEqual(['error', 'malformed'])
  })

  it('reports running while the latest schedule event is an open call', () => {
    const builder = new ConstructionGanttSnapshotBuilder()
    expect(builder.replace({ nodes: [node({ kind: 'schedule-running', callId: 'call-1' }, 1)] }).running).toBe(true)
    expect(builder.replace({ nodes: [node({ kind: 'schedule-running', callId: 'call-1' }, 1), resultNode(2)] }).running).toBe(false)
    expect(builder.apply({ upserts: [node({ kind: 'schedule-running', callId: 'call-3' }, 3)] }).running).toBe(true)
  })

  it('keeps the newer scenario when an older duplicate result id arrives later', () => {
    const builder = new ConstructionGanttSnapshotBuilder()
    builder.replace({ nodes: [resultNode(5, 'same')] })
    const snapshot = builder.apply({ upserts: [resultNode(2, 'same')] })
    expect(snapshot.scenarios).toHaveLength(1)
    expect(snapshot.scenarios[0]?.seq).toBe(5)
  })

  it('creates an isolated builder per view definition', () => {
    const first = constructionGanttViewDefinition.create()
    const second = constructionGanttViewDefinition.create()
    const timeline = { turnOrder: [], turns: new Map() }
    expect(first.empty).toEqual({ scenarios: [], failures: [], running: false })
    expect(first.replace({ nodes: [], timeline })).toEqual(second.replace({ nodes: [], timeline }))
  })
})
