// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { RunningToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { useDisclosure } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/use-disclosure.ts'
import { zh as conversationZh } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import { toolEn, toolZh } from '../src/client/locale.ts'
import { readToolPresentation } from '../src/client/tool/denoise-presentation.ts'
import { TechnicalDetails } from '../src/client/tool/components/TechnicalDetails.tsx'
import { ToolRow } from '../src/client/tool/components/ToolRow.tsx'
import { GenericToolCard, type GenericToolCardProps } from '../src/client/tool/toolviews/GenericToolCard.tsx'
import { BashRow, type BashRowProps } from '../src/client/tool/toolviews/bash-sample.tsx'

const DENOISE_ATTRIBUTE = 'data-dsw-output-denoise'
const UI_MODE_ATTRIBUTE = 'data-dsw-ui-mode'

const t: GenericToolCardProps['t'] = makeTranslate(conversationZh, commonZh)
const tTool = makeTranslate(toolZh, commonZh)
const tToolEn = makeTranslate(toolEn, commonZh)

const result = (over?: Partial<ToolResultNode>): ToolResultNode => ({
  kind: 'tool-result', seq: 10, time: 2_000, callId: 'c1',
  call: { name: 'mystery', argsRaw: '{"command":"ls -la","description":"List files"}' },
  callTime: 1_000,
  content: [{ type: 'text', text: 'file-a\nfile-b' }], isError: false, subCalls: [], ...over,
})

function cardProps(toolName: string, block: RunningToolCall | ToolResultNode): GenericToolCardProps {
  return {
    loadImage: vi.fn(() => Promise.reject(new Error('not used'))),
    useDisclosure,
    callId: 'c1', toolName, block, openFile: vi.fn(), t, tTool,
  }
}

function bashProps(block: RunningToolCall | ToolResultNode): BashRowProps {
  return {
    callId: 'c1', toolName: 'bash', block, sessionId: 's1',
    useSessions: (() => undefined) as BashRowProps['useSessions'],
    openFile: vi.fn(), loadImage: vi.fn(() => Promise.reject(new Error('not used'))),
    useDisclosure, t, tTool,
  } as unknown as BashRowProps
}

const bashResult = (over?: Partial<ToolResultNode>): ToolResultNode => result({
  call: { name: 'bash', argsRaw: '{"command":"ls -la","description":"List files"}' },
  ...over,
})

afterEach(() => {
  cleanup()
  document.body.removeAttribute(DENOISE_ATTRIBUTE)
  document.body.removeAttribute(UI_MODE_ATTRIBUTE)
})

describe('readToolPresentation', () => {
  it('defaults to denoise off and business mode with no attributes', () => {
    expect(readToolPresentation()).toEqual({ denoise: false, expert: false })
  })

  it('reads the denoise flag and expert mode from the body attributes', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    expect(readToolPresentation()).toEqual({ denoise: true, expert: false })
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'expert')
    expect(readToolPresentation()).toEqual({ denoise: true, expert: true })
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'business')
    expect(readToolPresentation()).toEqual({ denoise: true, expert: false })
  })
})

describe('TechnicalDetails', () => {
  it('starts collapsed and expands on click with localized copy', () => {
    const view = render(
      <TechnicalDetails t={tTool} defaultOpen={false}>
        <span>raw payload</span>
      </TechnicalDetails>,
    )
    const toggle = view.getByRole('button', { name: /技术详情/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toBe('展开技术详情')
    expect(view.queryByText('raw payload')).toBeNull()
    fireEvent.click(toggle)
    expect(view.getByRole('button', { name: /技术详情/ }).getAttribute('aria-expanded')).toBe('true')
    expect(view.getByRole('button').getAttribute('aria-label')).toBe('收起技术详情')
    expect(view.getByText('raw payload')).toBeTruthy()
    fireEvent.click(view.getByRole('button'))
    expect(view.queryByText('raw payload')).toBeNull()
  })

  it('honors defaultOpen for expert mode and localizes to English', () => {
    const view = render(
      <TechnicalDetails t={tToolEn} defaultOpen>
        <span>raw payload</span>
      </TechnicalDetails>,
    )
    const toggle = view.getByRole('button', { name: /technical details/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('Collapse technical details')
    expect(view.getByText('raw payload')).toBeTruthy()
  })
})

describe('ToolRow technical layer', () => {
  const rowProps = {
    t,
    useDisclosure,
    variant: 'others' as const,
    icon: <i data-testid="tool-icon" />,
    title: '工具调用',
    summary: 'mystery · {"a":1}',
    bodyRaw: '{"a":1}',
    output: 'raw result',
    state: 'ok' as const,
  }

  it('keeps the raw IN/OUT card direct when no layer is passed', () => {
    const view = render(<ToolRow {...rowProps} />)
    fireEvent.click(view.getByRole('button'))
    expect(view.container.querySelector('[data-technical-details]')).toBeNull()
    expect(view.getByText('raw result')).toBeTruthy()
  })

  it('wraps the identical IN/OUT card in the technical-details layer', () => {
    const view = render(<ToolRow {...rowProps} technical={{ t: tTool, defaultOpen: false }} />)
    fireEvent.click(view.getByRole('button'))
    const details = view.container.querySelector('[data-technical-details]')
    expect(details).not.toBeNull()
    expect(details?.getAttribute('data-open')).toBeNull()
    expect(view.queryByText('raw result')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: /技术详情/ }))
    expect(view.container.querySelector('[data-technical-details]')?.getAttribute('data-open')).toBe('true')
    expect(view.getByText('raw result')).toBeTruthy()
    expect(view.getByText(/"a": 1/)).toBeTruthy()
  })
})

describe('GenericToolCard denoise layering (fallback row)', () => {
  it('renders the pre-layer shape with the flag off', () => {
    const view = render(<GenericToolCard {...cardProps('mystery', result())} />)
    expect(view.container.textContent).toContain('mystery · ls -la')
    fireEvent.click(view.getByRole('button', { name: /工具调用/ }))
    expect(view.container.querySelector('[data-technical-details]')).toBeNull()
    expect(view.getByText(/file-a/)).toBeTruthy()
  })

  it('layers raw arguments and output behind technical details in business mode', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    const view = render(<GenericToolCard {...cardProps('mystery', result())} />)
    // The business summary line is unchanged.
    expect(view.container.textContent).toContain('mystery · ls -la')
    fireEvent.click(view.getByRole('button', { name: /工具调用/ }))
    const details = view.container.querySelector('[data-technical-details]')
    expect(details).not.toBeNull()
    expect(details?.getAttribute('data-open')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: /技术详情/ }))
    expect(view.getByText(/file-a/)).toBeTruthy()
    expect(view.getByText(/"command": "ls -la"/)).toBeTruthy()
  })

  it('opens technical details by default in expert mode', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'expert')
    const view = render(<GenericToolCard {...cardProps('mystery', result())} />)
    fireEvent.click(view.getByRole('button', { name: /工具调用/ }))
    expect(view.container.querySelector('[data-technical-details]')?.getAttribute('data-open')).toBe('true')
    expect(view.getByText(/file-a/)).toBeTruthy()
  })

  it('keeps failure judgement on the row, not the layer: error state and failure line stay visible', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    const failed = result({
      isError: true,
      content: [{ type: 'text', text: 'boom: it broke' }],
    })
    const view = render(<GenericToolCard {...cardProps('mystery', failed)} />)
    expect(view.container.querySelector('[data-state="error"]')).not.toBeNull()
    expect(view.getByText('boom: it broke')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: /工具调用/ }))
    // The failure summary is row state; the raw card hides inside the closed layer.
    expect(view.getByText('boom: it broke')).toBeTruthy()
    const details = view.container.querySelector('[data-technical-details]')
    expect(details?.getAttribute('data-open')).toBeNull()
  })
})

describe('BashRow denoise layering (representative tool)', () => {
  it('renders the terminal output directly with the flag off', () => {
    const view = render(<BashRow {...bashProps(bashResult())} />)
    fireEvent.click(view.container.querySelector('[data-sample="bash"]') as HTMLElement)
    expect(view.container.querySelector('[data-technical-details]')).toBeNull()
    expect(view.container.querySelector('[class*="terminal"]')).not.toBeNull()
  })

  it('layers the terminal output behind technical details in business mode', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    const view = render(<BashRow {...bashProps(bashResult())} />)
    expect(view.container.textContent).toContain('List files')
    fireEvent.click(view.container.querySelector('[data-sample="bash"]') as HTMLElement)
    const details = view.container.querySelector('[data-technical-details]')
    expect(details).not.toBeNull()
    expect(details?.getAttribute('data-open')).toBeNull()
    expect(view.queryByText('file-a')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: /技术详情/ }))
    expect(view.getByText(/file-a/)).toBeTruthy()
  })

  it('opens technical details by default in expert mode', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    document.body.setAttribute(UI_MODE_ATTRIBUTE, 'expert')
    const view = render(<BashRow {...bashProps(bashResult())} />)
    fireEvent.click(view.container.querySelector('[data-sample="bash"]') as HTMLElement)
    expect(view.container.querySelector('[data-technical-details]')?.getAttribute('data-open')).toBe('true')
    expect(view.getByText(/file-a/)).toBeTruthy()
  })

  it('keeps non-expandable rows untouched while the flag is on', () => {
    document.body.setAttribute(DENOISE_ATTRIBUTE, '')
    const quiet = bashResult({ content: [] })
    const view = render(<BashRow {...bashProps(quiet)} />)
    const row = view.container.querySelector('[data-sample="bash"]') as HTMLElement
    expect(row.getAttribute('data-expandable')).toBeNull()
    fireEvent.click(row)
    expect(view.container.querySelector('[data-technical-details]')).toBeNull()
  })
})
