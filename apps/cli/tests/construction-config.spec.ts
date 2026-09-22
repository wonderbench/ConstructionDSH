/**
 * The construction example overlay and bundle patch stay config-only. This
 * suite parses both, verifies the standards RAG contract fields and secret
 * handling, composes the bundle patch over dsh-base, then boots the overlay
 * through the real Cordis Loader with the RAG command pointed at a dead path
 * and proves the construction tools still register and the failure stays
 * contained.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { boot, composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import * as ConstructionRuntime from '@deepseek-ai/dsh-construction-runtime/src/index.ts'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import * as McpClient from '@deepseek-ai/dsh-mcp-client/src/index.ts'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem/src/index.ts'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'

interface InsertedRow {
  id?: string
  name?: string
  config?: Record<string, unknown>
  disabled?: boolean
}

/** The construction tool catalog, from the runtime source. */
const CONSTRUCTION_TOOLS = [
  'construction_files_inspect',
  'construction_files_read',
  'construction_files_search',
  'construction_pdf_split',
  'construction_cost_calculate',
  'construction_cost_compare',
  'construction_cost_export',
  'construction_schedule_calculate',
  'construction_schedule_present',
  'construction_report_export',
] as const

/** Every bare package name the example overlay names, mapped to test builtins. */
const BUILTIN_NAMES: Record<string, string> = {
  '@deepseek-ai/dsh-construction-runtime': 'cordis:construction-test-runtime',
  '@deepseek-ai/dsh-mcp-client': 'cordis:construction-test-mcp-client',
  '@deepseek-ai/dsh-skill-filesystem': 'cordis:construction-test-skill-filesystem',
}

const root = resolve(import.meta.dirname, '../../..')
const exampleFile = resolve(root, 'apps/cli/config/examples/construction/cordis.yml')
const bundlePatchFile = resolve(root, 'packages/bundle/construction/cordis.patch.yml')
const basePatchFile = resolve(root, 'packages/bundle/base/cordis.patch.yml')
const baseConfig = resolve(import.meta.dirname, 'fixtures/construction-base.cordis.yml')

const liveContexts = new Set<Context>()

afterEach(async () => {
  await Promise.all([...liveContexts].map(async ctx => ctx.fiber.dispose()))
  liveContexts.clear()
})

/** Map every bare plugin name in a patch list to the test builtins. */
function remapToBuiltins(patches: PatchOptions[]): PatchOptions[] {
  for (const patch of patches) {
    if (patch.insert === undefined) {
      remapRow(patch as InsertedRow)
      continue
    }
    for (const row of patch.insert as InsertedRow[]) {
      remapRow(row)
    }
  }
  return patches
}

/** Swap one row's bare package name for its test builtin when one is mapped. */
function remapRow(row: InsertedRow): void {
  const builtin = typeof row.name === 'string' ? BUILTIN_NAMES[row.name] : undefined
  if (builtin !== undefined) row.name = builtin
}

function insertedRow(patches: PatchOptions[], id: string): InsertedRow {
  for (const patch of patches) {
    const row = (patch.insert ?? []).find((entry) => {
      return (entry as InsertedRow).id === id
    })
    if (row !== undefined) return row as InsertedRow
  }
  throw new Error(`no inserted row with id ${id}`)
}

function prepareContext(ctx: Context): void {
  liveContexts.add(ctx)
  ctx.loader.builtins['construction-test-system-prompt'] = SystemPrompt
  ctx.loader.builtins['construction-test-tools'] = ToolRuntime
  ctx.loader.builtins['construction-test-fs'] = LocalFileSystem
  ctx.loader.builtins['construction-test-skills'] = SkillRegistry
  ctx.loader.builtins['construction-test-runtime'] = ConstructionRuntime
  ctx.loader.builtins['construction-test-mcp-client'] = McpClient
  ctx.loader.builtins['construction-test-skill-filesystem'] = SkillFilesystem
}

async function waitForSchemas(ctx: Context, names: readonly string[]): Promise<void> {
  const deadline = Date.now() + 10_000
  for (const name of names) {
    while (!ctx.tools.schemas().some(schema => schema.name === name)) {
      if (Date.now() >= deadline) throw new Error(`timed out waiting for ${name}`)
      await new Promise(resolveWait => setTimeout(resolveWait, 25))
    }
  }
}

describe('construction example overlay', () => {
  it('parses with the documented standards RAG contract fields and no secrets', () => {
    const source = readFileSync(exampleFile, 'utf8')
    const patches = loadOverlayPatches('construction-config-test', exampleFile)

    const runtime = insertedRow(patches, 'construction-runtime')
    expect(runtime.name).toBe('@deepseek-ai/dsh-construction-runtime')

    const rag = insertedRow(patches, 'standards-rag')
    expect(rag.name).toBe('@deepseek-ai/dsh-mcp-client')
    expect(rag.config?.serverName).toBe('standards')
    expect(rag.config?.transport).toBe('stdio')
    expect(rag.config?.failOnStartupError).toBe(false)
    expect(rag.config?.reconnect).toEqual({ enabled: false })
    const command = rag.config?.command as { __jsExpr?: unknown }
    const args = rag.config?.args as { __jsExpr?: unknown }
    expect(String(command.__jsExpr)).toContain('DSH_STANDARDS_RAG_COMMAND')
    expect(String(command.__jsExpr)).toContain('standards-rag-mcp-server')
    expect(String(args.__jsExpr)).toContain('DSH_STANDARDS_RAG_ARGS')

    const skill = patches.find(patch => patch.id === 'skill-filesystem')
    expect(skill).toBeDefined()
    const skillConfig = skill?.config as Record<string, unknown> | undefined
    expect(skillConfig?.includeDefaultRoots).toBe(false)
    expect(skillConfig?.providerName).toBe('filesystem')

    expect(source).not.toMatch(/\bsk-[A-Za-z0-9_-]{8,}\b/)
    expect(source).not.toContain('DEEPSEEK_API_KEY')
  })

  it('boots through the Loader with a dead RAG command and keeps every construction tool', async () => {
    const patches = remapToBuiltins(loadOverlayPatches('construction-config-test', exampleFile))
    // Point the standards RAG server at a path that cannot spawn. The
    // construction tools must still register while the MCP failure stays
    // contained inside the mcp-client row.
    const ragOverride: PatchOptions = {
      id: 'standards-rag',
      config: {
        serverName: 'standards',
        transport: 'stdio',
        command: resolve(root, 'definitely-missing-standards-rag-server'),
        args: [],
        env: {},
        cwd: root,
        toolCallTimeoutMs: 5_000,
        failOnStartupError: false,
        reconnect: { enabled: false },
      },
    }
    const ctx = await boot(
      'construction-config-test',
      baseConfig,
      [...patches, ragOverride],
      prepareContext,
    )
    await waitForSchemas(ctx, CONSTRUCTION_TOOLS)
    // Give the doomed MCP spawn its failure window, then re-read the catalog:
    // no standards tools appear and no construction tool disappeared.
    await new Promise(wait => setTimeout(wait, 1_000))
    const schemas = ctx.tools.schemas().map(schema => schema.name)
    expect(schemas.filter(name => name.startsWith('mcp__standards__'))).toEqual([])
    for (const name of CONSTRUCTION_TOOLS) {
      expect(schemas).toContain(name)
    }
  }, 20_000)
})

describe('construction bundle patch', () => {
  it('composes over dsh-base with runtime, client row, RAG, isolation, and disabled rows', () => {
    const basePatches = loadOverlayPatches('construction-config-test', basePatchFile)
    const bundlePatches = loadOverlayPatches('construction-config-test', bundlePatchFile)
    const entries = composeEntries([basePatches, bundlePatches])
    const byId = new Map(entries.map(entry => [entry.id, entry]))
    expect(byId.size).toBe(entries.length)

    expect(byId.get('construction-runtime')?.name).toBe('@deepseek-ai/dsh-construction-runtime')
    expect(byId.get('ui-construction-gantt')?.name).toBe('@deepseek-ai/dsh-client-ui-construction-gantt')

    const rag = byId.get('standards-rag')
    expect(rag?.name).toBe('@deepseek-ai/dsh-mcp-client')
    expect(rag?.config).toMatchObject({
      serverName: 'standards',
      transport: 'stdio',
      failOnStartupError: false,
      reconnect: { enabled: false },
    })

    const skill = byId.get('skill-filesystem')
    const skillConfig = skill?.config as Record<string, unknown> | undefined
    expect(skillConfig?.includeDefaultRoots).toBe(false)
    expect(skillConfig?.watch).toBe(true)

    for (const id of ['tool-bash', 'tool-pwsh', 'tool-workflow', 'workflow-ptc', 'ptc-runtime']) {
      expect(byId.get(id)?.disabled, id).toBe(true)
    }
    expect(byId.get('web')?.disabled).toBeUndefined()
    expect(byId.get('tool-web')?.disabled).toBeUndefined()
  })
})
