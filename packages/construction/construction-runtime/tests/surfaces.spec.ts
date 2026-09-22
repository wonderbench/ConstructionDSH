/**
 * The two config-gated surfaces: with both flags on (the default) the runtime
 * registers everything it always has; `business: false` leaves only the
 * drawing tools (file tools plus `construction_pdf_split`) with no skills
 * provider, no composer commands, no business tools, and no task-binding
 * prompt section; `drawing: false` leaves only the business surface; invalid
 * flag values and a both-off configuration fail loud at load.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import * as ConstructionRuntime from '../src/index.ts'
import { bootRuntime, copyAssets, seedWorkspace, workspace } from './helpers.ts'

const DRAWING_TOOLS = [
  'construction_files_inspect',
  'construction_files_read',
  'construction_files_search',
  'construction_pdf_split',
] as const

const BUSINESS_TOOLS = [
  'construction_cost_calculate',
  'construction_cost_compare',
  'construction_cost_export',
  'construction_report_export',
  'construction_schedule_calculate',
  'construction_schedule_present',
] as const

const liveContexts = new Set<Context>()

afterEach(async () => {
  await Promise.all([...liveContexts].map(async ctx => ctx.fiber.dispose()))
  liveContexts.clear()
})

/** Boot the runtime beside a command registry over a local workspace. */
async function bootWithCommands(dir: string, config: ConstructionRuntime.Config) {
  const ctx = new Context()
  liveContexts.add(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(CommandRuntime)
  const fiber = await ctx.plugin(ConstructionRuntime, config)
  return { ctx, fiber }
}

describe('config-gated surfaces', () => {
  it('defaults both surfaces on: ten tools, the provider, the commands, and the section', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir, {})
    try {
      expect(ctx.tools.schemas().map(schema => schema.name).sort()).toEqual([...DRAWING_TOOLS, ...BUSINESS_TOOLS].sort())
      const assembled = await ctx.systemPrompt.assemble()
      expect(assembled.sections.map(section => section.name)).toContain('construction:task-binding')
      expect(await ctx.skills.list({ cwd: dir })).toHaveLength(4)
    } finally {
      await fiber.dispose()
    }
  })

  it('drawing-only registers the drawing tools and nothing of the business surface', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootWithCommands(dir, { business: false })
    try {
      expect(ctx.tools.schemas().map(schema => schema.name).sort()).toEqual([...DRAWING_TOOLS].sort())
      expect(await ctx.skills.list({ cwd: dir })).toEqual([])
      expect(ctx.commands.list({ id: 'drawing-only' } as never)).toEqual([])
      const assembled = await ctx.systemPrompt.assemble()
      expect(assembled.sections.map(section => section.name)).not.toContain('construction:task-binding')
    } finally {
      await fiber.dispose()
    }
  })

  it('business-only registers the business surface without drawing tools or file guidance', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootWithCommands(dir, { drawing: false })
    try {
      expect(ctx.tools.schemas().map(schema => schema.name).sort()).toEqual([...BUSINESS_TOOLS].sort())
      const catalog = await ctx.skills.list({ cwd: dir })
      expect(catalog.map(skill => skill.name)).toHaveLength(4)
      const listed = ctx.commands.list({ id: 'business-only' } as never)
      expect(listed.map(descriptor => descriptor.name)).toEqual([
        'construction-cost',
        'construction-quality',
        'construction-safety',
        'construction-schedule',
      ])
      const assembled = await ctx.systemPrompt.assemble()
      const section = assembled.sections.find(entry => entry.name === 'construction:task-binding')
      expect(section).toBeDefined()
      expect(section?.text).toContain('construction_cost_calculate')
      expect(section?.text).not.toContain('construction_files_inspect')
      expect(section?.text).not.toContain('construction_pdf_split')
    } finally {
      await fiber.dispose()
    }
  })

  it('requires only the assets of each enabled surface', async () => {
    const scriptsOnly = copyAssets(mkdtempSync(join(tmpdir(), 'dsh-construction-scripts-only-')))
    rmSync(join(scriptsOnly, 'skills'), { recursive: true, force: true })
    const { ctx: drawingCtx, fiber: drawingFiber } = await bootRuntime(workspace(), { assetRoot: scriptsOnly, business: false })
    try {
      expect(drawingCtx.tools.schemas().map(schema => schema.name).sort()).toEqual([...DRAWING_TOOLS].sort())
    } finally {
      await drawingFiber.dispose()
    }

    const skillsOnly = copyAssets(mkdtempSync(join(tmpdir(), 'dsh-construction-skills-only-')))
    rmSync(join(skillsOnly, 'scripts'), { recursive: true, force: true })
    const { ctx: businessCtx, fiber: businessFiber } = await bootRuntime(workspace(), { assetRoot: skillsOnly, drawing: false })
    try {
      expect(businessCtx.tools.schemas().map(schema => schema.name).sort()).toEqual([...BUSINESS_TOOLS].sort())
    } finally {
      await businessFiber.dispose()
    }

    // The drawing surface still requires the worker scripts; the business
    // surface still requires the four SKILL.md files.
    expect(() => { ConstructionRuntime.apply(new Context(), { assetRoot: skillsOnly }) }).toThrow('construction_read.py')
    expect(() => { ConstructionRuntime.apply(new Context(), { assetRoot: scriptsOnly }) }).toThrow('skills/construction-safety/SKILL.md')
  })

  it('fails loud on invalid surface flags', () => {
    expect(() => { ConstructionRuntime.validateConfig({ drawing: 'yes' as never }) }).toThrow('drawing must be a boolean')
    expect(() => { ConstructionRuntime.validateConfig({ business: 0 as never }) }).toThrow('business must be a boolean')
    expect(() => { ConstructionRuntime.validateConfig({ drawing: false, business: false }) }).toThrow('at least one of drawing or business must be enabled')
    expect(() => { ConstructionRuntime.validateConfig({ drawing: false, business: true }) }).not.toThrow()
    expect(() => { ConstructionRuntime.validateConfig({ drawing: true, business: false }) }).not.toThrow()
  })
})
