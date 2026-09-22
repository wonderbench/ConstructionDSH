import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterAll, describe, expect, it } from 'vitest'
import { bootRuntime, callTool, copyAssets, fixtures, python, seedWorkspace, workspace } from './helpers.ts'
import * as PluginModule from '../src/index.ts'
import { loadSkillAssets, parseSkillFrontmatter, validateConfig } from '../src/index.ts'
import { calculateCost } from '../src/cost.ts'
import type { CostInput } from '../src/types.ts'

const COST_INPUT: CostInput = {
  variant: 'unit_rate',
  items: [
    {
      code: '0101',
      unit: 'm3',
      quantity: '1',
      resources: [{ kind: 'labor', name: 'crew', consumption: '1', unit_price: '100' }],
      fees: [],
    },
  ],
}

function textOf(result: { content: readonly { type: string; text?: string }[] }): string {
  return result.content.map(block => (block.type === 'text' ? block.text ?? '' : '')).join('\n')
}

describe('plugin assembly', () => {
  it('registers all ten tools and the prompt section, and disposes them with the fiber (HMR)', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      const names = ctx.tools.schemas().map(schema => schema.name).sort()
      expect(names).toEqual([
        'construction_cost_calculate',
        'construction_cost_compare',
        'construction_cost_export',
        'construction_files_inspect',
        'construction_files_read',
        'construction_files_search',
        'construction_pdf_split',
        'construction_report_export',
        'construction_schedule_calculate',
        'construction_schedule_present',
      ])
      const assembled = await ctx.systemPrompt.assemble()
      expect(assembled.sections.map(section => section.name)).toContain('construction:task-binding')
      await fiber.dispose()
      expect(ctx.tools.schemas()).toHaveLength(0)
      const after = await ctx.systemPrompt.assemble()
      expect(after.sections.map(section => section.name)).not.toContain('construction:task-binding')
      expect(await ctx.skills.list({ cwd: dir })).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('fails loud on invalid configuration at load', () => {
    expect(() => { validateConfig({ scriptTimeoutMs: 0 }) }).toThrow('scriptTimeoutMs must be a positive integer')
    expect(() => { validateConfig({ maxFileBytes: -1 }) }).toThrow('maxFileBytes must be a positive integer')
    expect(() => { validateConfig({ costPrecision: 11 }) }).toThrow('costPrecision must be an integer between 0 and 10')
    expect(() => { validateConfig({ artifactsDir: '/absolute/path' }) }).toThrow('artifactsDir must be a non-empty workspace-relative path')
    expect(() => { validateConfig({ artifactsDir: '../escape' }) }).toThrow('artifactsDir must be a non-empty workspace-relative path')
    expect(() => { validateConfig({ weeklyRestDays: [9] }) }).toThrow('between 0 (Sunday) and 6 (Saturday)')
    expect(() => { validateConfig({ holidays: ['21-09-2026'] }) }).toThrow('must be an ISO date')
    expect(() => { validateConfig({ pythonPath: '  ' }) }).toThrow('pythonPath must be a non-empty string')
    expect(() => { validateConfig({ skillsProviderName: '' }) }).toThrow('skillsProviderName must be a non-empty string')
    expect(() => { validateConfig({}) }).not.toThrow()
    expect(() => { validateConfig({
      scriptTimeoutMs: 60_000,
      maxFileBytes: 20 * 1024 * 1024,
      maxOutputChars: 200_000,
      costPrecision: 2,
      artifactsDir: '.dsh/construction',
      weeklyRestDays: [6, 0],
      holidays: ['2026-10-01'],
      skillsProviderName: 'construction',
    }) }).not.toThrow()
  })

  it('rejects a relative or incomplete asset tree before registration', async () => {
    const ctx = new Context()
    try {
      expect(() => { PluginModule.apply(ctx, { assetRoot: 'relative/assets' }) }).toThrow('absolute directory')
      const root = mkdtempSync(join(tmpdir(), 'dsh-construction-empty-assets-'))
      try {
        expect(() => { PluginModule.apply(ctx, { assetRoot: root }) }).toThrow('construction_read.py')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('ships the four business skills with normal and exceptional fixtures (B05)', () => {
    const assets = copyAssets(mkdtempSync(join(tmpdir(), 'dsh-construction-assets-')))
    const loaded = loadSkillAssets(assets)
    expect(loaded.map(asset => asset.directory)).toEqual([
      'construction-safety',
      'construction-quality',
      'construction-cost',
      'construction-schedule',
    ])
    for (const asset of loaded) {
      expect(asset.description.length).toBeGreaterThan(0)
      const body = readFileSync(asset.path, 'utf8')
      expect(body).toContain('Prohibited behavior')
      const skillDir = join(assets, 'skills', asset.directory)
      const fixtureNames = readdirSync(join(skillDir, 'fixtures'))
      const normal = fixtureNames.filter(name => name.startsWith('normal-'))
      const exceptional = fixtureNames.filter(name => name.startsWith('exceptional-'))
      expect(normal.length, `${asset.directory} normal fixtures`).toBeGreaterThanOrEqual(1)
      expect(exceptional.length, `${asset.directory} exceptional fixtures`).toBeGreaterThanOrEqual(1)
      for (const name of fixtureNames) {
        const fixture = JSON.parse(readFileSync(join(skillDir, 'fixtures', name), 'utf8')) as {
          description?: string
          inputs?: unknown
          expected_output?: unknown
        }
        expect(fixture.description, `${asset.directory}/${name}`).toBeTruthy()
        expect(fixture.inputs, `${asset.directory}/${name}`).toBeTruthy()
        expect(fixture.expected_output, `${asset.directory}/${name}`).toBeTruthy()
      }
      expect(readdirSync(join(skillDir, 'templates')).length).toBeGreaterThanOrEqual(1)
    }
    // The fixed unit-rate fixture reproduces at declared precision (B06 cross-check).
    const costFixture = JSON.parse(
      readFileSync(join(assets, 'skills', 'construction-cost', 'fixtures', 'normal-unit-rate.json'), 'utf8'),
    ) as { inputs: CostInput; expected_output: { item_totals: Record<string, { amount: string }> } }
    const result = calculateCost(costFixture.inputs, 2)
    expect(result.items[0]?.amount).toBe(costFixture.expected_output.item_totals['0101']?.amount)
  })

  it('parses skill frontmatter without a YAML dependency', () => {
    const parsed = parseSkillFrontmatter('---\nname: x\ndescription: Hello world\n---\n\n# Body\n', '/tmp/SKILL.md')
    expect(parsed.name).toBe('x')
    expect(parsed.description).toBe('Hello world')
    expect(parsed.content).toBe('# Body')
    const anonymous = parseSkillFrontmatter('---\ndescription: Hello\n---\nbody', '/tmp/SKILL.md')
    expect(anonymous.name).toBeUndefined()
    const versioned = parseSkillFrontmatter('---\ndescription: Hello\nversion: 2.1.0\n---\nbody', '/tmp/SKILL.md')
    expect(versioned.version).toBe('2.1.0')
    expect(() => parseSkillFrontmatter('# no frontmatter', '/tmp/SKILL.md')).toThrow('no YAML frontmatter')
    expect(() => parseSkillFrontmatter('---\nname: x\n---\nbody', '/tmp/SKILL.md')).toThrow('no description')
    expect(() => parseSkillFrontmatter('---\nname: two words\ndescription: Hello\n---\nbody', '/tmp/SKILL.md')).toThrow('invalid name "two words"')
    expect(() => parseSkillFrontmatter('---\ndescription: Hello\nversion: 2.1\n---\nbody', '/tmp/SKILL.md')).toThrow('invalid version "2.1"')
    expect(() => parseSkillFrontmatter('---\ndescription: Hello\nversion: v1.2.3\n---\nbody', '/tmp/SKILL.md')).toThrow('invalid version "v1.2.3"')
  })

  it('fails loud when frontmatter name or version is malformed at load', () => {
    const renamed = copyAssets(mkdtempSync(join(tmpdir(), 'dsh-construction-renamed-assets-')))
    const renamedPath = join(renamed, 'skills', 'construction-cost', 'SKILL.md')
    writeFileSync(renamedPath, readFileSync(renamedPath, 'utf8').replace('name: construction-cost', 'name: other-skill'))
    expect(() => loadSkillAssets(renamed)).toThrow('declares name "other-skill" but must match its directory "construction-cost"')

    const badVersion = copyAssets(mkdtempSync(join(tmpdir(), 'dsh-construction-bad-version-assets-')))
    const versionPath = join(badVersion, 'skills', 'construction-cost', 'SKILL.md')
    writeFileSync(versionPath, readFileSync(versionPath, 'utf8').replace('---\n', '---\nversion: 2.1\n'))
    expect(() => loadSkillAssets(badVersion)).toThrow('has an invalid version "2.1"')
  })

  it('loads skill version metadata from bundled frontmatter', () => {
    const assets = copyAssets(mkdtempSync(join(tmpdir(), 'dsh-construction-versioned-assets-')))
    const path = join(assets, 'skills', 'construction-cost', 'SKILL.md')
    writeFileSync(path, readFileSync(path, 'utf8').replace('---\n', '---\nversion: 3.0.0\n'))
    const loaded = loadSkillAssets(assets)
    expect(loaded.find(asset => asset.directory === 'construction-cost')?.version).toBe('3.0.0')
    expect(loaded.find(asset => asset.directory === 'construction-safety')?.version).toBeUndefined()
  })

  it('fails loud when one bundled skill file is missing', () => {
    const assets = copyAssets(mkdtempSync(join(tmpdir(), 'dsh-construction-broken-assets-')))
    rmSync(join(assets, 'skills', 'construction-quality'), { recursive: true, force: true })
    expect(() => loadSkillAssets(assets)).toThrow('skills/construction-quality/SKILL.md')
  })

  it('assembles without a skill registry and exposes the prompt text and binding listener', () => {
    const sections: { name: string; order: number; text: (context: { scope?: unknown }) => string }[] = []
    const listeners: ((exec: unknown, result: unknown) => void)[] = []
    const registered: string[] = []
    const fakeCtx = {
      tools: {
        register: (definition: { name: string }) => { registered.push(definition.name) },
        get: () => undefined,
      },
      get: () => undefined,
      on: (_event: string, listener: (exec: unknown, result: unknown) => void) => { listeners.push(listener) },
      systemPrompt: {
        section: (section: { name: string; order: number; text: (context: { scope?: unknown }) => string }) => { sections.push(section) },
        getSectionOrder: () => 100,
      },
    }
    PluginModule.apply(fakeCtx as unknown as Context, {})
    expect(registered).toHaveLength(10)
    expect(sections.map(section => section.name)).toEqual(['construction:task-binding'])
    // With the tools hidden under this scope, the guidance renders empty.
    expect(sections[0]?.text({ scope: undefined })).toBe('')

    // The binding listener observes skill tool results: failed calls, non-skill
    // calls, and non-business names mint nothing; a successful business skill
    // call mints a binding (agent-scoped when an agent is observable).
    const listener = listeners[0] as (exec: unknown, result: unknown) => void
    expect(listener).toBeDefined()
    listener({ name: 'read', arguments: {} }, { isError: false })
    listener({ name: 'skill', arguments: { name: 'construction-cost' } }, { isError: true })
    listener({ name: 'skill', arguments: { name: 'office-docx' } }, { isError: false })
    listener({ name: 'skill', arguments: { name: 42 } }, { isError: false })
    listener({ name: 'skill', arguments: { name: 'construction-schedule' }, agent: {} }, { isError: false })
  })

  it('lists the bundled skills and mints bindings through the registry (B04 through composition)', async () => {
    const dir = workspace()
    seedWorkspace(dir)
    const { ctx, fiber } = await bootRuntime(dir)
    try {
      const catalog = await ctx.skills.list({ cwd: dir })
      expect(catalog.map(skill => skill.name)).toEqual([
        'construction-cost',
        'construction-quality',
        'construction-safety',
        'construction-schedule',
      ])
      for (const skill of catalog) {
        expect(skill).toMatchObject({ source: 'bundled', provider: 'construction', invocation: { modelInvocable: true, userInvocable: true } })
      }
      const loaded = await ctx.skills.get('construction-cost', { cwd: dir })
      expect(loaded?.content).toContain('Prohibited behavior')

      // Binding minted by the provider callback: cost tool runs for an agent
      // without its own binding via the plugin-level fallback.
      const allowed = await callTool(ctx, dir, 'construction_cost_calculate', { input: COST_INPUT })
      expect(allowed.isError).toBe(false)

      // A different business skill supersedes: the cost tool is denied.
      await ctx.skills.get('construction-safety', { cwd: dir })
      const denied = await callTool(ctx, dir, 'construction_cost_calculate', { input: COST_INPUT })
      expect(denied.isError).toBe(true)
      expect(textOf(denied as never)).toContain('is a safety task')
    } finally {
      await fiber.dispose()
    }
  })
})


describe('real Loader composition', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-construction-loader-'))

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('boots a test-only cordis.yml through the Loader and executes a denial', async () => {
    const workspaceDir = join(root, 'workspace')
    cpSync(fixtures(), workspaceDir, { recursive: true })
    const configPath = join(root, 'cordis.yml')
    writeFileSync(configPath, [
      "- name: '@deepseek-ai/dsh-tools'",
      "- name: '@deepseek-ai/dsh-fs-local'",
      '  config:',
      `    cwd: ${JSON.stringify(workspaceDir)}`,
      "- name: '@deepseek-ai/dsh-skill'",
      "- name: '@deepseek-ai/dsh-system-prompt'",
      "- name: '@deepseek-ai/dsh-construction-runtime'",
      '  config:',
      `    pythonPath: ${JSON.stringify(python)}`,
      '',
    ].join('\n'))
    const ctx = new Context()
    try {
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      const modules = new Map<string, unknown>([
        ['@deepseek-ai/dsh-tools', ToolRuntime],
        ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
        ['@deepseek-ai/dsh-skill', SkillRegistry],
        ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
        ['@deepseek-ai/dsh-construction-runtime', PluginModule],
      ])
      ctx.loader.internal = {
        version: 'v2',
        async import(specifier: string) {
          if (!modules.has(specifier)) throw new Error(`Unexpected Loader import: ${specifier}`)
          return modules.get(specifier)
        },
      } as unknown as NonNullable<typeof ctx.loader.internal>
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
      await ctx.loader.await()
      expect(ctx.tools.schemas().map(schema => schema.name)).toContain('construction_files_read')

      const agent = { session: { header: { cwd: workspaceDir } } } as unknown as Agent
      // Business tool without a task: observable denial through the composed app.
      const denied = await ctx.tools.execute({
        callId: ToolCallId('loader-denied-1'),
        name: 'construction_cost_calculate',
        arguments: { input: COST_INPUT },
        signal: new AbortController().signal,
        agent,
      })
      expect(denied.isError).toBe(true)
      expect(textOf(denied as never)).toContain('no active construction task')

      // Load the cost skill through the composed registry, then calculate for real.
      const skill = await ctx.skills.get('construction-cost', { cwd: workspaceDir })
      expect(skill?.provider).toBe('construction')
      const allowed = await ctx.tools.execute({
        callId: ToolCallId('loader-allowed-1'),
        name: 'construction_cost_calculate',
        arguments: { input: COST_INPUT },
        signal: new AbortController().signal,
        agent,
      })
      expect(allowed.isError).toBe(false)

      // A file read runs the real Python worker end to end.
      const read = await ctx.tools.execute({
        callId: ToolCallId('loader-read-1'),
        name: 'construction_files_read',
        arguments: { file: 'report.docx' },
        signal: new AbortController().signal,
        agent,
      })
      expect(read.isError).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
