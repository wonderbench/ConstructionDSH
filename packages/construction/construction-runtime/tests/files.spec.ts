import { mkdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootRuntime, callTool, fixtures, python, seedWorkspace, tryEscapingSymlink, workspace } from './helpers.ts'
import { runReadOperation, resolveScreenedFile, type FileToolSettings } from '../src/files.ts'
import type { DocumentResult } from '../src/types.ts'

async function bootSeeded(config = {}) {
  const dir = workspace()
  seedWorkspace(dir)
  const { ctx, fiber } = await bootRuntime(dir, config)
  return { dir, ctx, fiber }
}

function textOf(result: { content: readonly { type: string; text?: string }[]; isError: boolean }): string {
  return result.content.map(block => (block.type === 'text' ? block.text ?? '' : '')).join('\n')
}

describe('construction file tools (B02, B11)', () => {
  it('inspects a Word file with structure and complete coverage', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_inspect', { file: 'report.docx' })
      expect(call.isError).toBe(false)
      const value = (call as { value: DocumentResult }).value
      expect(value.status).toBe('ok')
      expect(value.file.format).toBe('docx')
      expect(value.coverage?.state).toBe('complete')
      expect(value.file.sha256).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      await fiber.dispose()
    }
  })

  it('reads a Word file with headings, tables, and word source references', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: 'report.docx' })
      expect(call.isError).toBe(false)
      const value = (call as { value: DocumentResult }).value
      expect(value.status).toBe('ok')
      const content = value.content as {
        blocks: ({ type: string; text?: string; heading_level?: number; rows?: string[][] })[]
      }
      expect(content.blocks.some(block => block.heading_level === 1 && block.text === 'Scope')).toBe(true)
      const table = content.blocks.find(block => block.type === 'table')
      expect(table?.rows?.[1]).toEqual(['excavation', '1200 m3'])
      expect(value.source_refs.some(ref => ref.kind === 'word' && ref.table !== undefined)).toBe(true)
      expect(value.source_refs.some(ref => ref.kind === 'word' && ref.paragraph !== undefined && ref.section_path.includes('Scope'))).toBe(true)
    } finally {
      await fiber.dispose()
    }
  })

  it('reports tracked changes as a needs_review warning (B02)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: 'report-tracked.docx' })
      expect(call.isError).toBe(false)
      const value = (call as { value: DocumentResult }).value
      expect(value.coverage?.state).toBe('needs_review')
      expect(value.coverage?.warnings.some(warning => warning.includes('tracked changes'))).toBe(true)
      expect(textOf(call as never)).toContain('tracked changes')
    } finally {
      await fiber.dispose()
    }
  })

  it('reads an Excel workbook with formulas, missing cache state, merges, and hidden sheets (B02)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: 'boq.xlsx' })
      expect(call.isError).toBe(false)
      const value = (call as { value: DocumentResult }).value
      expect(value.status).toBe('ok')
      const content = value.content as {
        sheets: { name: string; merges: string[]; cells: { ref: string; formula?: string; cached?: unknown }[] }[]
        formula_cache: string
      }
      const boq = content.sheets.find(sheet => sheet.name === 'BOQ')
      expect(boq).toBeDefined()
      expect(boq?.merges).toContain('A4:B4')
      const formulaCell = boq?.cells.find(cell => cell.ref === 'D2')
      expect(formulaCell?.formula).toBe('=C2*2')
      expect(formulaCell?.cached).toBeNull()
      expect(content.formula_cache).toBe('missing')
      expect(value.coverage?.state).toBe('needs_review')
      expect(value.coverage?.warnings.some(warning => warning.includes('openpyxl never evaluates formulas'))).toBe(true)
      expect(content.sheets.some(sheet => sheet.name === 'hidden-sheet')).toBe(true)
      expect(value.source_refs.some(ref => ref.kind === 'excel' && ref.sheet === 'BOQ' && ref.range === 'D2')).toBe(true)
    } finally {
      await fiber.dispose()
    }
  })

  it('reads a PDF with per-page text and flags pages needing a visual read (B02)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: 'doc.pdf' })
      expect(call.isError).toBe(false)
      const value = (call as { value: DocumentResult }).value
      const content = value.content as { page_count: number; pages: { page: number; text: string; needs_visual_read: boolean }[] }
      expect(content.page_count).toBe(4)
      expect(content.pages[0]?.text).toContain('Hello construction fixture')
      expect(content.pages[3]?.needs_visual_read).toBe(true)
      expect(value.coverage?.state).toBe('needs_review')
      expect(value.coverage?.warnings.some(warning => warning.includes('needs a visual read'))).toBe(true)
      const pdfRefs = value.source_refs.map(ref => (ref.kind === 'pdf' ? { page: ref.page, name: ref.file.split(/[\\/]/).pop() } : ref))
      expect(pdfRefs).toEqual([
        { page: 1, name: 'doc.pdf' },
        { page: 2, name: 'doc.pdf' },
        { page: 3, name: 'doc.pdf' },
        { page: 4, name: 'doc.pdf' },
      ])
    } finally {
      await fiber.dispose()
    }
  })

  it('searches across formats and returns source-referenced matches (B02)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const pdf = await callTool(ctx, dir, 'construction_files_search', { file: 'doc.pdf', query: 'excavation' })
      expect(pdf.isError).toBe(false)
      const pdfValue = (pdf as { value: DocumentResult }).value
      const pdfMatches = pdfValue.content as { match_count: number; matches: { source_ref: { kind: string; page: number } }[] }
      expect(pdfMatches.match_count).toBe(1)
      expect(pdfMatches.matches[0]?.source_ref).toMatchObject({ kind: 'pdf', page: 2 })

      const docx = await callTool(ctx, dir, 'construction_files_search', { file: 'report.docx', query: 'formation' })
      const docxValue = (docx as { value: DocumentResult }).value
      const docxMatches = docxValue.content as { matches: { source_ref: { kind: string; paragraph: number } }[] }
      expect(docxMatches.matches[0]?.source_ref).toMatchObject({ kind: 'word', paragraph: 3 })

      const xlsx = await callTool(ctx, dir, 'construction_files_search', { file: 'boq.xlsx', query: 'earthwork' })
      const xlsxValue = (xlsx as { value: DocumentResult }).value
      const xlsxMatches = xlsxValue.content as { matches: { source_ref: { kind: string; sheet: string; range: string } }[] }
      expect(xlsxMatches.matches[0]?.source_ref).toMatchObject({ kind: 'excel', sheet: 'BOQ', range: 'B2' })
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects empty search queries', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_search', { file: 'doc.pdf', query: '  ' })
      expect(call.isError).toBe(true)
      expect(textOf(call as never)).toContain('query must be a non-empty string')
    } finally {
      await fiber.dispose()
    }
  })

  it('reports legacy .doc and .xls as explicit unsupported results (B02)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      for (const [file, modern] of [['legacy.doc', '.docx'], ['legacy.xls', '.xlsx']] as const) {
        const call = await callTool(ctx, dir, 'construction_files_read', { file })
        expect(call.isError).toBe(false)
        const value = (call as { value: DocumentResult }).value
        expect(value.status).toBe('unsupported')
        expect(value.errors[0]).toContain('legacy')
        expect(value.errors[0]).toContain(modern)
      }
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects macro-enabled Office files without processing them (B11)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: 'macro.docm' })
      expect(call.isError).toBe(false)
      const value = (call as { value: DocumentResult }).value
      expect(value.status).toBe('rejected')
      expect(value.errors[0]).toContain('macro-enabled')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects unknown formats explicitly', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: 'notes.txt' })
      const value = (call as { value: DocumentResult }).value
      expect(value.status).toBe('rejected')
      expect(value.errors[0]).toContain('unsupported format')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects traversal outside the workspace (B11)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: '../outside.docx' })
      expect(call.isError).toBe(true)
      expect(textOf(call as never)).toContain('outside the session workspace')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects escaping symlinks through the realpath containment check (B11)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const link = tryEscapingSymlink(dir)
      if (link === undefined) return // platform refuses symlink creation; traversal test above holds the gate
      const call = await callTool(ctx, dir, 'construction_files_read', { file: 'escape-link.docx' })
      expect(call.isError).toBe(true)
      expect(textOf(call as never)).toContain('outside the session workspace')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects missing paths and directories', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const missing = await callTool(ctx, dir, 'construction_files_read', { file: 'absent.docx' })
      expect(missing.isError).toBe(true)
      expect(textOf(missing as never)).toContain('was not found')
      mkdirSync(join(dir, 'folder.docx'))
      const directory = await callTool(ctx, dir, 'construction_files_read', { file: 'folder.docx' })
      expect(directory.isError).toBe(true)
      expect(textOf(directory as never)).toContain('not a regular file')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects oversized files at the configured cap (B11)', async () => {
    const { dir, ctx, fiber } = await bootSeeded({ maxFileBytes: 100 })
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: 'doc.pdf' })
      expect(call.isError).toBe(true)
      expect(textOf(call as never)).toContain('above the 100 byte limit; split it with construction_pdf_split or extract the needed part first')
    } finally {
      await fiber.dispose()
    }
  })

  it('reports encrypted and damaged PDFs as failed coverage instead of crashing', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const encrypted = await callTool(ctx, dir, 'construction_files_read', { file: 'encrypted.pdf' })
      expect(encrypted.isError).toBe(false)
      const encryptedValue = (encrypted as { value: DocumentResult }).value
      expect(encryptedValue.status).toBe('failed')
      expect(encryptedValue.coverage?.state).toBe('failed')
      expect(encryptedValue.errors[0]).toContain('encrypted')

      const damaged = await callTool(ctx, dir, 'construction_files_read', { file: 'damaged.pdf' })
      const damagedValue = (damaged as { value: DocumentResult }).value
      expect(damagedValue.status).toBe('failed')
      expect(damagedValue.errors[0]).toContain('cannot parse PDF')
    } finally {
      await fiber.dispose()
    }
  })

  it('requires a session workspace', async () => {
    const { ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, undefined, 'construction_files_read', { file: 'doc.pdf' })
      expect(call.isError).toBe(true)
      expect(textOf(call as never)).toContain('session workspace is required')
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects blank file paths', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: '   ' })
      expect(call.isError).toBe(true)
      expect(textOf(call as never)).toContain('file must be a non-empty path')
    } finally {
      await fiber.dispose()
    }
  })

  it('truncates oversized reads with a partial coverage state (B02)', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const call = await callTool(ctx, dir, 'construction_files_read', { file: 'doc.pdf', max_chars: 20 })
      expect(call.isError).toBe(false)
      const value = (call as { value: DocumentResult }).value
      expect(value.coverage?.state).toBe('partial')
      expect(value.coverage?.actual).toBe('truncated pages')
      expect(value.coverage?.warnings.some(warning => warning.includes('content truncated'))).toBe(true)
      const content = value.content as { pages: unknown[] }
      expect(content.pages.length).toBeLessThan(4)
    } finally {
      await fiber.dispose()
    }
  })

  it('rejects blank paths at the screening helper', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      const exec = {
        signal: new AbortController().signal,
        agent: { session: { header: { cwd: dir } } },
      } as never
      await expect(resolveScreenedFile(ctx, exec, '   ', 100)).rejects.toThrow('file must be a non-empty path')
    } finally {
      await fiber.dispose()
    }
  })

  it('maps worker failures to failed results for arbitrary jobs', async () => {
    const settings: FileToolSettings = {
      pythonPath: python,
      readScript: fileURLToPath(new URL('../assets/scripts/construction_read.py', import.meta.url)),
      scriptTimeoutMs: 30_000,
      maxFileBytes: 20 * 1024 * 1024,
      maxOutputChars: 200_000,
    }
    const exec = { signal: new AbortController().signal } as never
    const withFile = await runReadOperation(settings, exec, { op: 'read', file: join(fixtures(), 'absent.pdf') })
    expect(withFile.status).toBe('failed')
    expect(withFile.errors[0]).toContain('cannot open file')
    expect(withFile.coverage?.requested).toBe('read')
    const withoutShape = await runReadOperation(settings, exec, {})
    expect(withoutShape.status).toBe('failed')
    expect(withoutShape.file.path).toBe('')
    expect(withoutShape.coverage?.requested).toBe('read')
  })

  it('works without an active business task', async () => {
    const { dir, ctx, fiber } = await bootSeeded()
    try {
      // No skill was loaded: file tools still run.
      const call = await callTool(ctx, dir, 'construction_files_inspect', { file: 'report.docx' })
      expect(call.isError).toBe(false)
    } finally {
      await fiber.dispose()
    }
  })
})
