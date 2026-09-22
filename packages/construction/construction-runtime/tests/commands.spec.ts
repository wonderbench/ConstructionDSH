/**
 * Composer-menu commands for the four bundled business Skills: one
 * registration per skill derived from the same asset metadata as the skills
 * provider, advertised in the Functions section with argument input so the
 * composer claims the draft, and a handler that replays the `/name [args]`
 * user line the submitted claim produces — verified against tool-skill's
 * real injection output.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as toolSkill from '@deepseek-ai/dsh-tool-skill'
import { afterEach, describe, expect, it } from 'vitest'
import * as ConstructionRuntime from '../src/index.ts'
import { copyAssets, workspace } from './helpers.ts'

const tempDirs: string[] = []
afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

function tempAssets(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-construction-assets-'))
  tempDirs.push(dir)
  return copyAssets(dir)
}

/** Agent whose followup capture stands in for the driver: the command handler's only side effect. */
function capturingAgent(cwd: string, followup: (message: UserMessage) => void): Agent {
  const id = SessionId(`construction-commands-${cwd}`)
  const session = Session.create(id, [], {
    version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd, isSeeded: false,
  })
  return {
    ctx: new Context(),
    id,
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'idle',
    send: () => {},
    followup,
    steer: () => {},
    inject: () => { throw new Error('step-boundary catalog must not use agent.inject()') },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/** Boot the runtime beside the command registry, tool-skill's injection boundary, and a skill registry. */
async function bootWithCommands(dir: string, assetRoot: string) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(toolSkill)
  await ctx.plugin(CommandRuntime)
  const fiber = await ctx.plugin(ConstructionRuntime, { assetRoot })
  return { ctx, fiber }
}

describe('business-skill composer commands', () => {
  it('registers one Functions command per bundled skill from the shared asset metadata', async () => {
    const dir = workspace()
    const assetRoot = tempAssets()
    const { ctx, fiber } = await bootWithCommands(dir, assetRoot)
    try {
      const agent = { id: SessionId('construction-commands-list') } as Agent
      const listed = ctx.commands.list(agent)
      const assets = ConstructionRuntime.loadSkillAssets(assetRoot)
      expect(listed.map(descriptor => descriptor.name)).toEqual(assets.map(asset => asset.directory).sort())
      for (const asset of assets) {
        expect(listed.find(descriptor => descriptor.name === asset.directory)).toEqual({
          definitionId: CommandDefinitionId(`@deepseek-ai/dsh-construction-runtime/${asset.directory}`),
          name: asset.directory,
          description: asset.description,
          input: { hint: '<task>' },
          section: 'functions',
        })
      }
      await fiber.dispose()
      expect(ctx.commands.list(agent)).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('the handler replays the submitted claim: bare and argued followups drive tool-skill injection and mint the binding', async () => {
    const dir = workspace()
    const { ctx, fiber } = await bootWithCommands(dir, tempAssets())
    try {
      const followups: UserMessage[] = []
      const agent = capturingAgent(dir, (message) => { followups.push(message) })

      const bare = await ctx.commands.execute(agent, '/construction-cost', [], new AbortController().signal)
      expect(bare?.result).toEqual({ kind: 'success' })
      const argued = await ctx.commands.execute(agent, '/construction-cost  compare the two tenders', [], new AbortController().signal)
      expect(argued?.result).toEqual({ kind: 'success' })
      expect(followups).toHaveLength(2)
      // The handler's effect equals the user submitting the claimed draft:
      // one user message whose sole text is the `/name [args]` line, with
      // the invocation's argument text trimmed onto the gesture.
      expect(followups[0]).toMatchObject({
        role: 'user',
        content: [{ type: 'text', text: '/construction-cost' }],
        source: { kind: 'user' },
      })
      expect(followups[1]).toMatchObject({
        role: 'user',
        content: [{ type: 'text', text: '/construction-cost compare the two tenders' }],
        source: { kind: 'user' },
      })

      // Each followup message through tool-skill's real pre-step boundary
      // yields the rendered <skill_content> body — the typed path's output —
      // for both the bare and the argued gesture.
      const signal = new AbortController().signal
      for (const [index, message] of followups.entries()) {
        const decision: PreStepDecision = await agentEvents(ctx, agent).waterfall(
          'agent/pre-step',
          { messages: [message], turn: 1, step: 1, signal },
          () => Promise.resolve({ kind: 'enter', messages: [message] }),
        )
        if (decision.kind !== 'enter') throw new Error('expected the step to enter')
        const injected = decision.messages.filter(followup =>
          (followup.source as { kind?: unknown }).kind === 'skill-invocation')
        expect(injected).toHaveLength(1)
        expect(injected[0]).toMatchObject({
          source: { kind: 'skill-invocation', name: 'construction-cost', form: 'instructions' },
        })
        const text = injected[0]!.content.map(block => (block.type === 'text' ? block.text : '')).join('\n')
        expect(text).toContain('<skill_content name="construction-cost">')
        expect(text).toContain('</skill_content>')
        expect(text).toContain('Prohibited behavior')
        if (index === 1) {
          const all = decision.messages.map(followup => followup.content.map(block => (block.type === 'text' ? block.text : '')).join('\n')).join('\n')
          expect(all).toContain('compare the two tenders')
        }
      }
      // Key lines of the loaded cost skill body, rendered by tool-skill's own builder.
      const loaded = await ctx.skills.get('construction-cost', { cwd: dir, signal })
      expect(loaded?.content).toContain('Prohibited behavior')
    } finally {
      await fiber.dispose()
      await ctx.fiber.dispose()
    }
  })

  it('registers no commands when the command registry is absent', () => {
    const registered: string[] = []
    const fakeCtx = {
      tools: { register: (definition: { name: string }) => { registered.push(definition.name) }, get: () => undefined },
      get: () => undefined,
      on: () => {},
      systemPrompt: {
        section: () => {},
        getSectionOrder: () => 100,
      },
    }
    ConstructionRuntime.apply(fakeCtx as unknown as Context, {})
    expect(registered).toHaveLength(10)
  })
})
