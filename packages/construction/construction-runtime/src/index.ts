/**
 * Construction engineering Host runtime with two config-gated surfaces: the
 * drawing surface (read-only file tools and mechanical PDF splitting) and the
 * business surface (deterministic costing, CPM scheduling, report export, and
 * the four business Skills as bundled, read-only provider content with
 * lightweight per-tool task-type checks). Both surfaces default on.
 *
 * @module @deepseek-ai/dsh-construction-runtime
 */

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillProvider,
  type SkillResourceBase,
} from '@deepseek-ai/dsh-skill'
import { resolvePythonPath } from './python.ts'
import { TaskBindings, taskTypeOfSkill } from './tasks.ts'
import { applyFileTools } from './files.ts'
import { applySplitTool } from './split.ts'
import { applyCostTools } from './cost.ts'
import { applyScheduleTools, ScheduleResultStore } from './schedule.ts'
import { applyReportTool } from './report.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'construction-runtime'

/** Services required by the construction tool suite. */
export const inject = ['tools', 'fs', 'systemPrompt']

const DEFAULT_SCRIPT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024
const DEFAULT_COST_PRECISION = 2
const DEFAULT_MAX_OUTPUT_CHARS = 200_000
const DEFAULT_ARTIFACTS_DIR = '.dsh/construction'
const DEFAULT_WEEKLY_REST_DAYS = [6, 0]
const SKILL_DIRECTORIES = ['construction-safety', 'construction-quality', 'construction-cost', 'construction-schedule'] as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Plugin configuration; every tunable lives here. */
export interface Config {
  /** Absolute assets directory containing scripts/ and skills/; defaults to the packaged assets. */
  assetRoot?: string
  /** Python interpreter or launcher; defaults to `py` on Windows and `python3` elsewhere. */
  pythonPath?: string
  /** Worker timeout in milliseconds before the child is killed. */
  scriptTimeoutMs?: number
  /** Maximum accepted input file size in bytes. */
  maxFileBytes?: number
  /** Maximum worker stdout characters accepted. */
  maxOutputChars?: number
  /** Declared cost output precision in decimal places. */
  costPrecision?: number
  /** Artifacts directory, relative to the session workspace. */
  artifactsDir?: string
  /** Default weekly rest days (0 Sunday to 6 Saturday) for schedule calculations. */
  weeklyRestDays?: number[]
  /** Default holiday ISO dates for schedule calculations. */
  holidays?: string[]
  /** Name of the bundled read-only skills provider. */
  skillsProviderName?: string
  /** Enable the drawing surface: the read-only file tools and `construction_pdf_split`. Defaults to true. */
  drawing?: boolean
  /** Enable the business surface: bundled skills provider, composer commands, task tools, and task-binding guidance. Defaults to true. */
  business?: boolean
}

/** Schemastery config with deployment defaults. */
export const Config: z<Config> = z.object({
  assetRoot: z.string(),
  pythonPath: z.string(),
  scriptTimeoutMs: z.number().default(DEFAULT_SCRIPT_TIMEOUT_MS),
  maxFileBytes: z.number().default(DEFAULT_MAX_FILE_BYTES),
  maxOutputChars: z.number().default(DEFAULT_MAX_OUTPUT_CHARS),
  costPrecision: z.number().default(DEFAULT_COST_PRECISION),
  artifactsDir: z.string().default(DEFAULT_ARTIFACTS_DIR),
  weeklyRestDays: z.array(z.number()).default(DEFAULT_WEEKLY_REST_DAYS),
  holidays: z.array(z.string()).default([]),
  skillsProviderName: z.string().default('construction'),
  drawing: z.boolean().default(true),
  business: z.boolean().default(true),
})

/** Fully resolved configuration with every default applied. */
export interface ResolvedConfig {
  /** Absolute assets directory. */
  readonly assetRoot: string
  /** Python interpreter or launcher. */
  readonly pythonPath: string | undefined
  /** Worker timeout in milliseconds. */
  readonly scriptTimeoutMs: number
  /** Maximum accepted input file size in bytes. */
  readonly maxFileBytes: number
  /** Maximum worker stdout characters. */
  readonly maxOutputChars: number
  /** Declared cost output precision in decimal places. */
  readonly costPrecision: number
  /** Artifacts directory, relative to the session workspace. */
  readonly artifactsDir: string
  /** Default weekly rest days for schedule calculations. */
  readonly weeklyRestDays: readonly number[]
  /** Default holiday ISO dates for schedule calculations. */
  readonly holidays: readonly string[]
  /** Name of the bundled read-only skills provider. */
  readonly skillsProviderName: string
  /** Whether the drawing surface registers. */
  readonly drawing: boolean
  /** Whether the business surface registers. */
  readonly business: boolean
}

/**
 * Apply the deployment defaults to one raw configuration. Defaults live here
 * (not at use sites) so direct `apply()` calls behave exactly like
 * Loader-applied configurations.
 * @param config - the raw plugin configuration.
 * @returns the resolved configuration.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  return {
    assetRoot: config.assetRoot ?? fileURLToPath(new URL('../assets/', import.meta.url)),
    pythonPath: config.pythonPath,
    scriptTimeoutMs: config.scriptTimeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS,
    maxFileBytes: config.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    maxOutputChars: config.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
    costPrecision: config.costPrecision ?? DEFAULT_COST_PRECISION,
    artifactsDir: config.artifactsDir ?? DEFAULT_ARTIFACTS_DIR,
    weeklyRestDays: config.weeklyRestDays ?? DEFAULT_WEEKLY_REST_DAYS,
    holidays: config.holidays ?? [],
    skillsProviderName: config.skillsProviderName ?? 'construction',
    drawing: config.drawing ?? true,
    business: config.business ?? true,
  }
}

/**
 * Validate the resolved configuration and fail loud at load; a
 * misconfigured deployment must not register half-working tools.
 * @param config - the raw plugin configuration; defaults are applied first.
 */
export function validateConfig(config: Config): void {
  const resolved = resolveConfig(config)
  const errors: string[] = []
  if (!isAbsolute(resolved.assetRoot)) errors.push('assetRoot must be an absolute directory')
  if (resolved.pythonPath !== undefined && resolved.pythonPath.trim().length === 0) errors.push('pythonPath must be a non-empty string')
  for (const [field, value] of [['scriptTimeoutMs', resolved.scriptTimeoutMs], ['maxFileBytes', resolved.maxFileBytes], ['maxOutputChars', resolved.maxOutputChars]] as const) {
    if (!Number.isInteger(value) || value < 1) errors.push(`${field} must be a positive integer`)
  }
  if (!Number.isInteger(resolved.costPrecision) || resolved.costPrecision < 0 || resolved.costPrecision > 10) errors.push('costPrecision must be an integer between 0 and 10')
  if (isAbsolute(resolved.artifactsDir) || resolved.artifactsDir.split(/[\\/]/).includes('..') || resolved.artifactsDir.trim().length === 0) {
    errors.push('artifactsDir must be a non-empty workspace-relative path without parent traversal')
  }
  for (const day of resolved.weeklyRestDays) {
    if (!Number.isInteger(day) || day < 0 || day > 6) errors.push(`weeklyRestDays entry ${String(day)} must be an integer between 0 (Sunday) and 6 (Saturday)`)
  }
  for (const holiday of resolved.holidays) {
    if (!ISO_DATE.test(holiday)) errors.push(`holidays entry "${holiday}" must be an ISO date (YYYY-MM-DD)`)
  }
  if (resolved.skillsProviderName.trim().length === 0) errors.push('skillsProviderName must be a non-empty string')
  for (const field of ['drawing', 'business'] as const) {
    if (config[field] !== undefined && typeof config[field] !== 'boolean') errors.push(`${field} must be a boolean`)
  }
  if (!resolved.drawing && !resolved.business) errors.push('at least one of drawing or business must be enabled')
  if (errors.length > 0) throw new Error(`construction-runtime config: ${errors.join('; ')}`)
}

/** Parsed skill frontmatter used for catalog entries and binding metadata. */
interface ParsedSkillFrontmatter {
  /** Declared skill name when the frontmatter carries one. */
  readonly name?: string
  /** Short routing description. */
  readonly description: string
  /** Optional version metadata. */
  readonly version?: string
  /** Markdown body after the frontmatter. */
  readonly content: string
}

/** One bundled skill asset: its directory, routing copy, and source file. */
interface SkillAsset {
  /** Skill directory name, for example `construction-cost`. */
  readonly directory: string
  /** Short routing description. */
  readonly description: string
  /** Optional version metadata. */
  readonly version?: string
  /** Absolute SKILL.md path. */
  readonly path: string
}

/**
 * Parse the minimal frontmatter (name, description, optional version) of one
 * bundled skill without a YAML dependency. A declared name must be a single
 * non-empty token and a declared version must look like `1.2.3`; violations
 * fail loud, naming the file.
 * @param raw - the full SKILL.md text.
 * @param path - the file path for error messages.
 * @returns the parsed asset metadata.
 */
export function parseSkillFrontmatter(raw: string, path: string): ParsedSkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match === null) throw new Error(`construction-runtime: ${path} has no YAML frontmatter`)
  const header = match[1] as string
  const description = /^description:\s*(.+)$/mu.exec(header)?.[1]?.trim()
  if (description === undefined || description.length === 0) throw new Error(`construction-runtime: ${path} has no description`)
  const name = /^name:\s*(.+)$/mu.exec(header)?.[1]?.trim()
  if (name !== undefined && !/^\S+$/u.test(name)) throw new Error(`construction-runtime: ${path} has an invalid name "${name}"; expected a single non-empty token`)
  const version = /^version:\s*(.+)$/mu.exec(header)?.[1]?.trim()
  if (version !== undefined && version.length > 0 && !/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error(`construction-runtime: ${path} has an invalid version "${version}"; expected a version like 1.2.3`)
  }
  return {
    ...(name !== undefined && name.length > 0 ? { name } : {}),
    description,
    ...(version !== undefined && version.length > 0 ? { version } : {}),
    content: raw.slice(match[0].length).trim(),
  }
}

/**
 * Load and validate the bundled skill assets; a missing or malformed skill
 * fails the plugin at load.
 * @param assetRoot - the absolute assets directory.
 * @returns the four skill assets in catalog order.
 */
export function loadSkillAssets(assetRoot: string): SkillAsset[] {
  const assets: SkillAsset[] = []
  for (const directory of SKILL_DIRECTORIES) {
    const path = join(assetRoot, 'skills', directory, 'SKILL.md')
    if (!existsSync(path)) throw new Error(`construction-runtime: assets must contain skills/${directory}/SKILL.md`)
    const { name, description, version } = parseSkillFrontmatter(readFileSync(path, 'utf8'), path)
    if (name !== undefined && name !== directory) {
      throw new Error(`construction-runtime: ${path} declares name "${name}" but must match its directory "${directory}"`)
    }
    assets.push({ directory, description, ...(version !== undefined ? { version } : {}), path })
  }
  return assets
}

/**
 * Assemble the construction runtime: validate configuration, then register
 * each enabled surface's tools, the bundled read-only skills provider when a
 * skill registry is present, the composer commands when a command registry is
 * present, and the task-binding listeners and guidance. Every registration is
 * a Cordis effect released on fiber disposal.
 * @param ctx - the plugin context.
 * @param config - the plugin configuration after schema defaults.
 */
export function apply(ctx: Context, config: Config = {}): void {
  validateConfig(config)
  const resolved = resolveConfig(config)
  const assetRoot = resolved.assetRoot
  if (resolved.drawing) {
    for (const script of ['construction_read.py', 'construction_pdf_split.py']) {
      if (!existsSync(join(assetRoot, 'scripts', script))) {
        throw new Error(`construction-runtime: assets must contain scripts/${script}`)
      }
    }
  }
  const skills = resolved.business ? loadSkillAssets(assetRoot) : []

  if (resolved.drawing) {
    const settings = {
      pythonPath: resolvePythonPath(resolved.pythonPath),
      readScript: join(assetRoot, 'scripts', 'construction_read.py'),
      splitScript: join(assetRoot, 'scripts', 'construction_pdf_split.py'),
      scriptTimeoutMs: resolved.scriptTimeoutMs,
      maxFileBytes: resolved.maxFileBytes,
      maxOutputChars: resolved.maxOutputChars,
    }
    applyFileTools(ctx, settings)
    applySplitTool(ctx, { ...settings, artifactsDir: resolved.artifactsDir, splitScript: settings.splitScript })
  }

  if (!resolved.business) return
  const bindings = new TaskBindings()
  const artifactsDir = resolved.artifactsDir

  applyCostTools(ctx, { artifactsDir, precision: resolved.costPrecision }, bindings)
  applyScheduleTools(ctx, bindings, new ScheduleResultStore())
  applyReportTool(ctx, { artifactsDir }, bindings)

  // Mint a binding whenever a business skill body is loaded. The provider
  // callback is the guaranteed floor (both the model-facing `skill` tool and
  // a user-explicit invocation load through it); the `tools/result`
  // observation additionally scopes the binding to the calling agent when
  // one is observable.
  const skillsRegistry = ctx.get('skills')
  if (skillsRegistry !== undefined) {
    // Every bundled candidate carries a directory resource base.
    const candidates: (SkillCandidate & { readonly resourceBase: SkillResourceBase })[] = skills.map((asset) => {
      const directory = join(assetRoot, 'skills', asset.directory)
      return {
        name: asset.directory,
        description: asset.description,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: resolved.skillsProviderName,
        source: 'bundled',
        rank: BUNDLED_SKILL_RANK,
        resourceBase: { kind: 'directory', path: directory },
        locator: { path: asset.path, version: asset.version },
      }
    })
    const provider: SkillProvider = {
      name: resolved.skillsProviderName,
      list: () => Promise.resolve(candidates),
      async get(candidate, options) {
        const bundled = candidate as SkillCandidate & { readonly resourceBase: SkillResourceBase }
        const locator = candidate.locator as { path: string; version?: string }
        const raw = await readFile(locator.path, { encoding: 'utf8', signal: options.signal })
        // Every candidate this provider lists binds a business task.
        bindings.mint(bindings.scopeFor(undefined), candidate.name, locator.version)
        const { content } = parseSkillFrontmatter(raw, locator.path)
        return {
          name: candidate.name,
          description: candidate.description,
          invocation: candidate.invocation,
          source: candidate.source,
          provider: resolved.skillsProviderName,
          resourceBase: bundled.resourceBase,
          content,
        }
      },
    }
    skillsRegistry.registerProvider(() => provider)
  }

  // One composer-menu command per bundled business Skill, advertised in the
  // Functions section. Each command declares argument input, so picking its
  // row claims the composer draft like /goal and /plan; the handler enqueues
  // the `/name [args]` user line that submitting the claim produces, so the
  // menu path and the keyboard path converge on one injection pipeline: the
  // pre-step skill-invocation boundary loads the skill (minting its task
  // binding), appends the rendered body, and keeps any typed arguments as
  // trailing user text. The stable definitionId lets capable clients give
  // each row a localized face regardless of its catalog copy. Registered
  // only where both the skills registry and the command registry exist; the
  // effect disposers ride this plugin's fiber.
  const commandsRegistry = ctx.get('commands')
  if (skillsRegistry !== undefined && commandsRegistry !== undefined) {
    for (const asset of skills) {
      commandsRegistry.register({
        definitionId: CommandDefinitionId(`@deepseek-ai/dsh-construction-runtime/${asset.directory}`),
        name: asset.directory,
        description: asset.description,
        input: { hint: '<task>' },
        section: 'functions',
        handler: (invocation): CommandResult => {
          const args = invocation.rawInput.trim()
          invocation.agent.followup(createUserMessage({
            content: [{ type: 'text', text: `/${asset.directory}${args.length > 0 ? ` ${args}` : ''}` }],
            source: { kind: 'user' },
          }))
          return { kind: 'success' }
        },
      })
    }
  }

  ctx.on('tools/result', (exec, result) => {
    if (exec.name !== 'skill' || result.isError) return
    const loaded = (exec.arguments as { name?: unknown }).name
    if (typeof loaded === 'string' && taskTypeOfSkill(loaded) !== undefined) {
      bindings.mint(bindings.scopeFor(exec.agent), loaded)
    }
  })

  // The guidance covers the business tools and whichever other surface is
  // enabled; the drawing-only configuration omits the section entirely, and a
  // scope that hides every construction tool still renders nothing.
  const probeTool = resolved.drawing ? 'construction_files_inspect' : 'construction_cost_calculate'
  ctx.systemPrompt.section({
    name: 'construction:task-binding',
    order: ctx.systemPrompt.getSectionOrder('TOOL_READ') + 10,
    text: ({ scope }) => ctx.tools.get(probeTool, scope) === undefined
      ? ''
      : [
        ...(resolved.drawing
          ? [
            'Construction engineering tools are available in this session.',
            'The file tools construction_files_inspect, construction_files_read, and construction_files_search work without a business task and read Word, Excel, and PDF files with source references and coverage states; act on coverage warnings instead of assuming a file was fully read. construction_pdf_split splits an oversized or drawing-set PDF by page range, per page, or top-level bookmark so the file tools can read the parts; structured-decomposition modes return unsupported.',
          ]
          : []),
        'The business tools construction_cost_calculate, construction_cost_compare, construction_cost_export, construction_schedule_calculate, construction_schedule_present, and construction_report_export run only while a matching business task is active: load the construction-cost, construction-schedule, construction-safety, or construction-quality skill with the skill tool to start one. Loading a business skill supersedes the previous task, so older task ids stop working.',
        'Never treat a blank cell or missing price as zero, and never invent rates, dates, or a critical path.',
      ].join(' '),
  })
}

export type { SkillAsset }
