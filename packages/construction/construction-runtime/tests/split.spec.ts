import { existsSync, symlinkSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bootRuntime, callTool, seedWorkspace, workspace } from './helpers.ts'
import type { SplitResult } from '../src/types.ts'

async function bootSeeded(config = {}) {
  const dir = workspace()
  seedWorkspace(dir)
  const { ctx, fiber } = await bootRuntime(dir, config)
  return { dir, ctx, fiber }
}

function valueOf(call: { isError: boolean; value?: unknown }): unknown {
  expect(call.isError).toBe(false)
  return call.value
}

describe('construction_pdf_split (B03, B11)', () => {
  it('splits by explicit ranges with original-page mapping and an index', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_pdf_split', {
        file: 'pages.pdf',
        by: 'range',
        ranges: [{ from: 1, to: 2 }, { from: 3, to: 4 }],
      })
      const result = valueOf(call) as SplitResult
      expect(result.status).toBe('ok')
      expect(result.split_by).toBe('range')
      expect(result.outputs?.map(output => output.pages)).toEqual([[1, 2], [3, 4]])
      expect(result.source?.page_count).toBe(4)
      expect(result.source?.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(result.parser_version).toBe('construction-pdf-split/1.0.0')
      expect(result.index_file).toBeDefined()
      expect(result.coverage?.state).toBe('complete')
      for (const output of result.outputs ?? []) {
        expect(existsSync(output.file)).toBe(true)
      }
      const index = JSON.parse(await readFile(result.index_file as string, 'utf8')) as {
        source: { sha256: string; page_count: number }
        outputs: { pages: number[] }[]
      }
      expect(index.source.page_count).toBe(4)
      expect(index.outputs.map(output => output.pages)).toEqual([[1, 2], [3, 4]])
    } finally {
      await fiber.dispose()
    }
  })

  it('splits one file per page without altering page boxes', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_pdf_split', { file: 'pages.pdf', by: 'per_page' })
      const result = valueOf(call) as SplitResult
      expect(result.outputs).toHaveLength(4)
      expect(result.outputs?.every(output => output.pages.length === 1)).toBe(true)
      // The output directory lives under the workspace artifacts dir.
      expect(result.output_dir).toBeDefined()
      expect(result.index_file).toContain('index.json')
    } finally {
      await fiber.dispose()
    }
  })

  it('splits on top-level bookmark boundaries', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_pdf_split', { file: 'outlined.pdf', by: 'bookmark' })
      const result = valueOf(call) as SplitResult
      expect(result.status).toBe('ok')
      expect(result.split_by).toBe('bookmark')
      expect(result.outputs?.map(output => output.pages)).toEqual([[1, 2], [3, 4]])
    } finally {
      await fiber.dispose()
    }
  })

  it('returns an explicit unsupported status for structured decomposition (B03)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      for (const mode of ['structure', 'mineru']) {
        const call = await callTool(ctx, dir, 'construction_pdf_split', { file: 'pages.pdf', by: 'range', ranges: [{ from: 1, to: 1 }], mode })
        const result = valueOf(call) as SplitResult
        expect(result.status).toBe('unsupported')
        expect(result.reason).toContain('not available in this release')
        expect(result.reason).toContain(mode)
      }
    } finally {
      await fiber.dispose()
    }
  })

  it('refuses non-PDF files explicitly', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_pdf_split', { file: 'report.docx', by: 'per_page' })
      const result = valueOf(call) as SplitResult
      expect(result.status).toBe('unsupported')
      expect(result.reason).toContain('not a PDF')
    } finally {
      await fiber.dispose()
    }
  })

  it('requires ranges for range mode and validates them', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const missing = await callTool(ctx, dir, 'construction_pdf_split', { file: 'pages.pdf', by: 'range' })
      expect(missing.isError).toBe(true)
      expect((missing.content[0] as { text?: string }).text).toContain('requires at least one')
      const outOfRange = await callTool(ctx, dir, 'construction_pdf_split', {
        file: 'pages.pdf',
        by: 'range',
        ranges: [{ from: 3, to: 9 }],
      })
      expect(outOfRange.isError).toBe(true)
      expect((outOfRange.content[0] as { text?: string }).text).toContain('outside the document')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects encrypted PDFs and workspace escapes (B11)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const encrypted = await callTool(ctx, dir, 'construction_pdf_split', { file: 'encrypted.pdf', by: 'per_page' })
      expect(encrypted.isError).toBe(true)
      expect((encrypted.content[0] as { text?: string }).text).toContain('PDF splitting failed')
      const traversal = await callTool(ctx, dir, 'construction_pdf_split', { file: '../pages.pdf', by: 'per_page' })
      expect(traversal.isError).toBe(true)
      expect((traversal.content[0] as { text?: string }).text).toContain('outside the session workspace')
    } finally {
      await fiber.dispose()
    }
  })

  it('requires a session workspace for outputs', async () => {
    const { ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, undefined, 'construction_pdf_split', { file: 'pages.pdf', by: 'per_page' })
      expect(call.isError).toBe(true)
      expect((call.content[0] as { text?: string }).text).toContain('session workspace is required')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects split outputs when the artifacts directory escapes the workspace (B11)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const outside = workspace()
      symlinkSync(outside, join(dir, '.dsh'), process.platform === 'win32' ? 'junction' : 'dir')
      const call = await callTool(ctx, dir, 'construction_pdf_split', { file: 'pages.pdf', by: 'per_page' })
      expect(call.isError).toBe(true)
      expect((call.content[0] as { text?: string }).text).toContain('resolves outside the session workspace')
    } finally {
      await fiber.dispose()
    }
  })

  it('writes outputs under the configured artifacts directory', async () => {
    const { dir, ctx, fiber } = await bootSeeded({ artifactsDir: '.dsh/custom-artifacts' })
    try {
      const call = await callTool(ctx, dir, 'construction_pdf_split', { file: 'pages.pdf', by: 'per_page' })
      const result = valueOf(call) as SplitResult
      expect(result.index_file).toContain('custom-artifacts')
      expect(existsSync(join(dir, '.dsh', 'custom-artifacts', 'splits'))).toBe(true)
      expect(existsSync(result.index_file as string)).toBe(true)
    } finally {
      await fiber.dispose()
    }
  })
})
