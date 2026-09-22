import { memo, useCallback, useMemo } from 'react'
import type { ChatNodeViewProps, TurnTailOwnerProps } from '../contract/slots.ts'
import { AssistantDenoise } from './AssistantDenoise.tsx'
import { AssistantMarkdown } from './AssistantMarkdown.tsx'
import { readDenoisePresentation } from './denoise-presentation.ts'

/** Streaming, settled, and interrupted Assistant states share one keyed renderer instance. */
export const AssistantNodeView = memo(function AssistantNodeView({
  node, useTurnData, turnProcess, openFile, renderMessageImages, fileMentions, t,
}: ChatNodeViewProps<'assistant-step'>) {
  const data = node.data
  const turn = node.location.kind === 'turn' || node.location.kind === 'step'
    ? node.location.turn
    : undefined
  const tail = useTurnData('turn-tail')
  const owner = useMemo<TurnTailOwnerProps | undefined>(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined
    return { turn, seq: data.finalNode.seq, openFile }
  }, [data.finalNode, openFile, tail, turn])
  const mentions = useMemo(
    () => owner === undefined ? undefined : fileMentions(owner),
    [fileMentions, owner],
  )
  const reasoningHidden = turnProcess !== undefined
    && turnProcess.foldable
    && turnProcess.spec.answerStep === data.step
    && turnProcess.spec.inlineReasoning
    && !turnProcess.open
  const revealProcess = useCallback(() => { turnProcess?.setOpen(true) }, [turnProcess])
  const markdownProps = {
    blocks: data.blocks,
    streaming: data.status === 'running',
    interrupted: data.status === 'interrupted',
    renderMessageImages,
    reasoningHidden,
    revealProcess,
    mentions,
    t,
  }
  // Denoise folds only a settled body of a closed Turn, and only in business
  // mode; every other state renders the untouched AssistantMarkdown, so the
  // flag off (or expert, or unfinished) is the pre-change rendering exactly.
  const presentation = readDenoisePresentation()
  if (presentation.denoise && !presentation.expert && data.status === 'settled' && turn?.status === 'closed') {
    return <AssistantDenoise {...markdownProps} />
  }
  return <AssistantMarkdown {...markdownProps} />
})
