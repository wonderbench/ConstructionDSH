import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fixtures, python } from './helpers.ts'

const readScript = fileURLToPath(new URL('../assets/scripts/construction_read.py', import.meta.url))
const splitScript = fileURLToPath(new URL('../assets/scripts/construction_pdf_split.py', import.meta.url))

function run(script: string, job: unknown): { status: number | null; stdout: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-construction-direct-'))
  const jobPath = join(dir, 'job.json')
  writeFileSync(jobPath, JSON.stringify(job))
  const result = spawnSync(python, [script, jobPath], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
  })
  return { status: result.status, stdout: result.stdout ?? '' }
}

describe('pinned Python workers (direct smoke)', () => {
  it('reads docx, xlsx, and pdf fixtures with source references and coverage', () => {
    const dir = fixtures()
    const docx = run(readScript, { op: 'read', file: join(dir, 'report.docx') })
    expect(docx.status).toBe(0)
    const docxResult = JSON.parse(docx.stdout) as { status: string; coverage: { state: string } }
    expect(docxResult.status).toBe('ok')
    expect(docxResult.coverage.state).toBe('complete')

    const xlsx = run(readScript, { op: 'inspect', file: join(dir, 'boq.xlsx') })
    const xlsxResult = JSON.parse(xlsx.stdout) as { content: { formula_cache: string; formula_count: number } }
    expect(xlsxResult.content.formula_count).toBe(1)
    expect(xlsxResult.content.formula_cache).toBe('missing')

    const pdf = run(readScript, { op: 'read', file: join(dir, 'doc.pdf') })
    const pdfResult = JSON.parse(pdf.stdout) as { content: { pages: { needs_visual_read: boolean }[] } }
    expect(pdfResult.content.pages[3]?.needs_visual_read).toBe(true)
  })

  it('reports damaged and encrypted PDFs as structured failures', () => {
    const dir = fixtures()
    // Read reports damaged content as a failed result (exit 0, explicit state)...
    const damaged = run(readScript, { op: 'read', file: join(dir, 'damaged.pdf') })
    expect(damaged.status).toBe(0)
    const damagedResult = JSON.parse(damaged.stdout) as { status: string; errors: string[] }
    expect(damagedResult.status).toBe('failed')
    expect(damagedResult.errors[0]).toContain('cannot parse PDF')

    // ...while inspect surfaces the parser failure as a structured DAMAGED error.
    const damagedInspect = run(readScript, { op: 'inspect', file: join(dir, 'damaged.pdf') })
    expect(damagedInspect.status).toBe(1)
    const damagedError = JSON.parse(damagedInspect.stdout) as { error: { code: string; message: string } }
    expect(damagedError.error.code).toBe('DAMAGED')
    expect(damagedError.error.message).toContain('cannot parse PDF')

    const encrypted = run(readScript, { op: 'inspect', file: join(dir, 'encrypted.pdf') })
    expect(encrypted.status).toBe(1)
    const encryptedError = JSON.parse(encrypted.stdout) as { error: { code: string } }
    expect(encryptedError.error.code).toBe('ENCRYPTED')
  })

  it('rejects bad jobs with structured errors', () => {
    const missing = run(readScript, { op: 'read', file: join(fixtures(), 'absent.pdf') })
    expect(missing.status).toBe(1)
    const missingError = JSON.parse(missing.stdout) as { error: { code: string } }
    expect(missingError.error.code).toBe('NOT_FOUND')

    const badOp = run(readScript, { op: 'shred', file: 'x.pdf' })
    expect(badOp.status).toBe(1)
    const badOpError = JSON.parse(badOp.stdout) as { error: { code: string } }
    expect(badOpError.error.code).toBe('BAD_JOB')

    const noQuery = run(readScript, { op: 'search', file: join(fixtures(), 'doc.pdf') })
    expect(noQuery.status).toBe(1)
    const noQueryError = JSON.parse(noQuery.stdout) as { error: { code: string } }
    expect(noQueryError.error.code).toBe('BAD_JOB')

    const emptyJob = run(readScript, {})
    expect(emptyJob.status).toBe(1)
    const emptyJobError = JSON.parse(emptyJob.stdout) as { error: { code: string } }
    expect(emptyJobError.error.code).toBe('BAD_JOB')
  })

  it('splits mechanically and refuses structured decomposition (B03 direct)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-construction-direct-split-'))
    const perPage = run(splitScript, { file: join(fixtures(), 'pages.pdf'), by: 'per_page', output_dir: join(dir, 'per-page'), job_id: 'smoke' })
    expect(perPage.status).toBe(0)
    const perPageResult = JSON.parse(perPage.stdout) as { status: string; outputs: { pages: number[] }[] }
    expect(perPageResult.status).toBe('ok')
    expect(perPageResult.outputs.map(output => output.pages)).toEqual([[1], [2], [3], [4]])

    const structured = run(splitScript, { file: join(fixtures(), 'pages.pdf'), by: 'mineru', output_dir: join(dir, 'mineru'), job_id: 'smoke2' })
    expect(structured.status).toBe(0)
    const structuredResult = JSON.parse(structured.stdout) as { status: string; reason: string }
    expect(structuredResult.status).toBe('unsupported')
    expect(structuredResult.reason).toContain('not available in this release')

    const badRange = run(splitScript, { file: join(fixtures(), 'pages.pdf'), by: 'range', ranges: [{ from: 2, to: 99 }], output_dir: join(dir, 'bad'), job_id: 'smoke3' })
    expect(badRange.status).toBe(1)
    const badRangeError = JSON.parse(badRange.stdout) as { error: { code: string } }
    expect(badRangeError.error.code).toBe('BAD_RANGE')
  })
})
