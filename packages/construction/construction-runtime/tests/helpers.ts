/**
 * Shared test helpers: generated binary fixtures (docx/xlsx/pdf), a booted
 * runtime with the real local filesystem backend, and an executor caller.
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ConstructionRuntime from '../src/index.ts'

/** Interpreter used for fixture generation and real worker runs. */
export const python: string = process.env.DSH_CONSTRUCTION_TEST_PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3')

const GENERATOR = String.raw`
import json, os, sys, zipfile, shutil

out = sys.argv[1]

def make_pdf(path, texts):
    objects = []
    page_ids = []
    for i, text in enumerate(texts):
        stream = ("BT /F1 12 Tf 72 %d Td (%s) Tj ET" % (720 - 72, text.replace('(', '[').replace(')', ']'))).encode()
        content_id = 3 + i * 3
        page_id = 4 + i * 3
        objects.append((content_id, b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"))
        page_ids.append(page_id)
        objects.append((page_id, ("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents %d 0 R >>" % content_id).encode()))
    kids = ' '.join('%d 0 R' % p for p in page_ids)
    objects.append((1, b"<< /Type /Catalog /Pages 2 0 R >>"))
    objects.append((2, ("<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids))).encode()))
    objects.append((5, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))
    objects.sort()
    data = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for num, body in objects:
        offsets[num] = len(data)
        data += ("%d 0 obj\n" % num).encode() + body + b"\nendobj\n"
    xref = len(data)
    maxnum = max(offsets)
    data += ("xref\n0 %d\n" % (maxnum + 1)).encode()
    data += b"0000000000 65535 f \n"
    for n in range(1, maxnum + 1):
        data += ("%010d 00000 n \n" % offsets.get(n, 0)).encode()
    data += ("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (maxnum + 1, xref)).encode()
    open(path, 'wb').write(bytes(data))

def add_ins_marker(source, target):
    tmp = source + '.tmpdocx'
    with zipfile.ZipFile(source) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == 'word/document.xml':
                data = data.replace(b'</w:p>', b'<w:ins w:id="1" w:author="reviewer" w:date="2026-01-01T00:00:00Z"><w:r><w:t>tracked addition</w:t></w:r></w:ins></w:p>', 1)
            zout.writestr(item, data)
    shutil.move(tmp, target)

from docx import Document
doc = Document()
doc.add_heading('Project Report', level=0)
doc.add_paragraph('Summary section')
doc.add_heading('Scope', level=1)
doc.add_paragraph('The contractor shall excavate to formation level.')
doc.add_paragraph('Concrete shall reach 30 MPa at 28 days.')
table = doc.add_table(rows=2, cols=2)
table.cell(0, 0).text = 'item'
table.cell(0, 1).text = 'qty'
table.cell(1, 0).text = 'excavation'
table.cell(1, 1).text = '1200 m3'
doc.save(os.path.join(out, 'report.docx'))
add_ins_marker(os.path.join(out, 'report.docx'), os.path.join(out, 'report-tracked.docx'))

from openpyxl import Workbook
wb = Workbook()
ws = wb.active
ws.title = 'BOQ'
ws['A1'] = 'code'
ws['B1'] = 'name'
ws['C1'] = 'qty'
ws['A2'] = '0101'
ws['B2'] = 'earthwork'
ws['C2'] = 1200
ws['D2'] = '=C2*2'
ws.merge_cells('A4:B4')
ws['A4'] = 'merged value'
hidden = wb.create_sheet('hidden-sheet')
hidden.sheet_state = 'hidden'
hidden['A1'] = 'not for tender'
wb.save(os.path.join(out, 'boq.xlsx'))

make_pdf(os.path.join(out, 'doc.pdf'), ['Hello construction fixture', 'Second page mentions excavation', 'Third page', ''])
make_pdf(os.path.join(out, 'pages.pdf'), ['page one', 'page two', 'page three', 'page four'])

from pypdf import PdfReader, PdfWriter
reader = PdfReader(os.path.join(out, 'pages.pdf'))
writer = PdfWriter()
for page in reader.pages:
    writer.add_page(page)
writer.add_outline_item('Chapter 1', 0)
writer.add_outline_item('Chapter 2', 2)
with open(os.path.join(out, 'outlined.pdf'), 'wb') as handle:
    writer.write(handle)

writer = PdfWriter()
for page in reader.pages:
    writer.add_page(page)
writer.encrypt('secret')
with open(os.path.join(out, 'encrypted.pdf'), 'wb') as handle:
    writer.write(handle)

open(os.path.join(out, 'damaged.pdf'), 'wb').write(b'this is not a pdf at all')
open(os.path.join(out, 'legacy.doc'), 'wb').write(b'\xd0\xcf\x11\xe0 legacy placeholder')
open(os.path.join(out, 'legacy.xls'), 'wb').write(b'\xd0\xcf\x11\xe0 legacy placeholder')
open(os.path.join(out, 'macro.docm'), 'wb').write(b'PK\x03\x04 macro placeholder')

marker = {'ready': True}
with open(os.path.join(out, '.fixtures.json'), 'w', encoding='utf-8') as handle:
    json.dump(marker, handle)
`

let fixtureDir: string | undefined

/** Generate (once per process) and return the shared fixture directory. */
export function fixtures(): string {
  if (fixtureDir !== undefined) return fixtureDir
  const dir = join(tmpdir(), `dsh-construction-fixtures-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const marker = join(dir, '.fixtures.json')
  if (!existsSync(marker)) {
    const script = join(dir, 'generate_fixtures.py')
    writeFileSync(script, GENERATOR)
    const result = spawnSync(python, [script, dir], { encoding: 'utf8', timeout: 120_000 })
    if (result.status !== 0) throw new Error(`fixture generation failed: ${result.stderr}\n${result.stdout}`)
  }
  fixtureDir = dir
  return dir
}

/** Fresh session workspace. */
export function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-construction-workspace-'))
}

/** Copy the generated fixtures into one workspace. */
export function seedWorkspace(dir: string): void {
  cpSync(fixtures(), dir, { recursive: true })
}

/** Boot the real runtime composition over a local workspace. */
export async function bootRuntime(dir: string, config: ConstructionRuntime.Config = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SkillRegistry)
  const fiber = await ctx.plugin(ConstructionRuntime, config)
  return { ctx, fiber }
}

let callCounter = 0

/** Execute one tool call as an agent scoped to the workspace. */
export function callTool(ctx: Context, cwd: string | undefined, name: string, args: unknown) {
  callCounter += 1
  const agent = { session: { header: { cwd } } } as unknown as Agent
  return ctx.tools.execute({
    callId: ToolCallId(`call-${callCounter}`),
    name,
    arguments: args,
    signal: new AbortController().signal,
    ...(cwd !== undefined ? { agent } : {}),
  })
}

/** Copy the packaged assets tree to one directory. */
export function copyAssets(target: string): string {
  const source = new URL('../assets/', import.meta.url)
  cpSync(source, target, { recursive: true })
  return target
}

/** Create an escaping symlink inside a workspace when the platform allows it. */
export function tryEscapingSymlink(dir: string): string | undefined {
  const outside = join(tmpdir(), `dsh-construction-outside-${process.pid}`)
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, 'secret.docx'), 'outside the workspace')
  const link = join(dir, 'escape-link.docx')
  try {
    symlinkSync(join(outside, 'secret.docx'), link, process.platform === 'win32' ? 'file' : undefined)
  } catch {
    return undefined
  }
  return link
}
