// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locale.ts'
import type { ChatNodeViewProps } from '../src/client/contract/slots.ts'
import { AssistantNodeView } from '../src/client/chat/AssistantNodeView.tsx'
import { nonProseBlocks, proseFold } from '../src/client/chat/assistant-denoise.ts'
import { readDenoisePresentation } from '../src/client/chat/denoise-presentation.ts'
import type { AssistantBlock } from '../src/client/contract/snapshot.ts'

const t = makeTranslate(zh, commonZh)

const DENOISE_ATTRIBUTE = 'data-dsw-output-denoise'
const UI_MODE_ATTRIBUTE = 'data-dsw-ui-mode'

const LONG_PROSE = [
  '拆分完成：12 个文件已输出到 out/ 目录。',
  '为了确保准确性，我首先逐一校验了每份图纸的图层结构，然后按专业系统分组。',
  '请注意，实际结果可能因源文件的命名规范而略有差异。',
  '所有中间产物均已保留，便于回溯。',
  '如需调整分组口径，请直接告诉我。',
].join('\n')

function textBlock(text: string): AssistantBlock {
  return { kind: 'text', text }
}

function makeNode(
  blocks: readonly AssistantBlock[],
  status: 'settled' | 'running' | 'interrupted' = 'settled',
  turnStatus: 'open' | 'closed' | 'unknown' = 'closed',
): ChatNodeViewProps<'assistant-step'>['node'] {
  return {
    key: 'fixture:assistant:1',
    target: 'chat',
    anchorSeq: 1,
    kind: 'assistant-step',
    location: {
      kind: 'turn',
      turn: { turn: 1, start: undefined, end: undefined, status: turnStatus, steps: [], data: undefined },
    },
    visibility: 'visible',
    data: {
      status,
      turn: 1,
      step: 1,
      blocks,
      time: 0,
      finalNode: { kind: 'assistant', seq: 1, time: 0, turn: 1, step: 1, blocks },
    },
  } as unknown as ChatNodeViewProps<'assistant-step'>['node']
}

function makeProps(blocks: readonly AssistantBlock[], status: 'settled' | 'running' | 'interrupted' = 'settled') {
  return {
    node: makeNode(blocks, status),
    useTurnData: (() => undefined) as ChatNodeViewProps<'assistant-step'>['useTurnData'],
    turnProcess: undefined,
    openFile: () => {},
    renderMessageImages: (() => null) as ChatNodeViewProps<'assistant-step'>['renderMessageImages'],
    fileMentions: () => undefined,
    t,
  } as unknown as ChatNodeViewProps<'assistant-step'>
}

afterEach(() => {
  cleanup()
  document.body.removeAttribute(DENOISE_ATTRIBUTE)
  document.body.removeAttribute(UI_MODE_ATTRIBUTE)
})

describe('readDenoisePresentation', () => {
  it('defaults to denoise off and business mode with no attributes', () => {
    expect(readDenoisePresentation()).toEqual({ denoise: false, expert: false })
  })

  it('reads the denoise flag and expert mode from the body attributes', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    expect(readDenoisePresentation()).toEqual({ denoise: true, expert: false })
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'expert')
    expect(readDenoisePresentation()).toEqual({ denoise: true, expert: true })
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'business')
    expect(readDenoisePresentation()).toEqual({ denoise: true, expert: false })
  })
})

describe('proseFold', () => {
  it('returns null when there is no prose', () => {
    expect(proseFold([{ kind: 'tool-call', callId: 'c1', name: 'read', argsRaw: '{}' }])).toBeNull()
    expect(proseFold([textBlock('   \n  ')])).toBeNull()
  })

  it('returns null when prose stays within the threshold', () => {
    const short = '第一行结论。\n第二行补充。\n第三行收尾。'
    expect(proseFold([textBlock(short)])).toBeNull()
  })

  it('folds prose beyond the threshold with the verbatim first line', () => {
    const fold = proseFold([textBlock(LONG_PROSE)])
    expect(fold?.conclusion).toBe('拆分完成：12 个文件已输出到 out/ 目录。')
    expect(LONG_PROSE).toContain(fold?.conclusion ?? '')
  })

  it('collects non-prose blocks in original order', () => {
    const reasoning: AssistantBlock = { kind: 'reasoning', text: 'thinking' }
    const blocks: AssistantBlock[] = [textBlock('a\nb\nc\nd'), reasoning, textBlock('e')]
    expect(nonProseBlocks(blocks)).toEqual([reasoning])
  })
})

describe('AssistantNodeView denoise presentation', () => {
  it('renders the pre-change shape with the flag off', () => {
    const view = render(<AssistantNodeView {...makeProps([textBlock(LONG_PROSE)])} />)
    expect(view.container.querySelector('[data-denoise-fold]')).toBeNull()
    for (const line of LONG_PROSE.split('\n')) {
      expect(view.container.textContent).toContain(line.trim())
    }
  })

  it('folds long prose in business mode and expands verbatim', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    const view = render(<AssistantNodeView {...makeProps([textBlock(LONG_PROSE)])} />)
    const fold = view.container.querySelector('[data-denoise-fold]')
    expect(fold).not.toBeNull()
    expect(fold?.getAttribute('data-expanded')).toBeNull()
    // Conclusion: verbatim slice of the model text, nothing else.
    expect(fold?.querySelector('p')?.textContent).toBe('拆分完成：12 个文件已输出到 out/ 目录。')
    expect(fold?.textContent).not.toContain('为了确保准确性')
    const toggle = view.getByRole('button', { name: /查看说明/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)
    expect(view.getByRole('button', { name: /收起说明/ }).getAttribute('aria-expanded')).toBe('true')
    expect(view.container.querySelector('[data-denoise-fold]')?.getAttribute('data-expanded')).toBe('true')
    // Every non-empty source line is present verbatim: one character unchanged,
    // one character not lost.
    for (const line of LONG_PROSE.split('\n')) {
      expect(view.container.textContent).toContain(line.trim())
    }

    fireEvent.click(view.getByRole('button', { name: /收起说明/ }))
    expect(view.container.textContent).not.toContain('为了确保准确性')
  })

  it('keeps non-prose blocks visible while prose folds', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    const blocks: AssistantBlock[] = [
      textBlock(LONG_PROSE),
      { kind: 'reasoning', text: '首先检查图层结构' },
    ]
    const view = render(<AssistantNodeView {...makeProps(blocks)} />)
    expect(view.getByText('思考')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: /查看说明/ }))
    expect(view.getByText('首先检查图层结构')).toBeTruthy()
  })

  it('renders short prose unfolded in business mode', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    const short = '第一行结论。\n第二行补充。\n第三行收尾。'
    const view = render(<AssistantNodeView {...makeProps([textBlock(short)])} />)
    expect(view.container.querySelector('[data-denoise-fold]')).toBeNull()
    expect(view.container.textContent).toContain('第二行补充。')
  })

  it('keeps prose full in expert mode', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'expert')
    const view = render(<AssistantNodeView {...makeProps([textBlock(LONG_PROSE)])} />)
    expect(view.container.querySelector('[data-denoise-fold]')).toBeNull()
    expect(view.container.textContent).toContain('为了确保准确性')
  })

  it('does not fold while the turn or step is unfinished', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    const running = render(<AssistantNodeView {...makeProps([textBlock(LONG_PROSE)], 'running')} />)
    expect(running.container.querySelector('[data-denoise-fold]')).toBeNull()
    const openTurn = render(
      <AssistantNodeView {...{
        ...makeProps([textBlock(LONG_PROSE)]),
        node: makeNode([textBlock(LONG_PROSE)], 'settled', 'open'),
      }} />,
    )
    expect(openTurn.container.querySelector('[data-denoise-fold]')).toBeNull()
  })

  it('never upgrades status from a completion claim: interrupted stays visible and claims stay prose', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    const interrupted = render(
      <AssistantNodeView {...makeProps([textBlock(LONG_PROSE)], 'interrupted')} />,
    )
    // A frozen partial is never folded, so its stopped marker cannot hide.
    expect(interrupted.container.querySelector('[data-denoise-fold]')).toBeNull()
    expect(interrupted.container.textContent).toContain('已停止')

    const claim = '已圆满完成全部工作，没有任何问题。\n说明第二行。\n说明第三行。\n说明第四行。'
    const claimed = render(<AssistantNodeView {...makeProps([textBlock(claim)])} />)
    const fold = claimed.container.querySelector('[data-denoise-fold]')
    // The claim is a verbatim conclusion line; the fold chrome carries no
    // status of its own — completion judgement stays with tool results and
    // deliverable events elsewhere in the turn.
    expect(fold?.querySelector('p')?.textContent).toBe('已圆满完成全部工作，没有任何问题。')
    expect(fold?.hasAttribute('data-state')).toBe(false)
  })
})
