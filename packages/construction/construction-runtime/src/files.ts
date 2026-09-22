/**
 * Shared read-only file tools: inspect, read, and search Word, Excel, and
 * lightweight PDF inputs with explicit source references and coverage
 * states. Every path is resolved through `ctx.fs`, confined to the session
 * workspace, size-capped, and extension-screened before the pinned Python
 * worker ever opens it; the tools work with or without an active business
 * task.
 *
 * @module @deepseek-ai/dsh-construction-runtime/src/files
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import { PythonJobError, runPythonJob } from './python.ts'
import type { DocumentFormat, DocumentResult } from './types.ts'

/** Resolved runtime settings shared by the file tools. */
export interface FileToolSettings {
  /** Interpreter executable or launcher. */
  readonly pythonPath: string
  /** Absolute path of construction_read.py. */
  readonly readScript: string
  /** Worker timeout in milliseconds. */
  readonly scriptTimeoutMs: number
  /** Maximum accepted file size in bytes. */
  readonly maxFileBytes: number
  /** Maximum worker stdout characters. */
  readonly maxOutputChars: number
}

/** Session workspace of one execution, when the caller runs inside a session. */
function sessionCwd(exec: ToolExecution): string | undefined {
  return exec.agent?.session.header.cwd
}

/**
 * Map a path to its screened format. Macro-enabled Office files are rejected
 * outright; legacy `.doc`/`.xls` receive the explicit unsupported state.
 * @param path - the model-supplied path.
 * @returns the screened format.
 */
export function formatOfPath(path: string): DocumentFormat {
  const lowered = path.toLowerCase()
  if (lowered.endsWith('.docx')) return 'docx'
  if (lowered.endsWith('.xlsx')) return 'xlsx'
  if (lowered.endsWith('.pdf')) return 'pdf'
  if (lowered.endsWith('.doc')) return 'doc'
  if (lowered.endsWith('.xls')) return 'xls'
  if (/\.(docm|xlsm|pptm|potm|xlsb|docb)$/.test(lowered)) return 'macro'
  return 'unknown'
}

function refusedResult(path: string, format: DocumentFormat, status: 'unsupported' | 'rejected', errors: readonly string[]): DocumentResult {
  return {
    schema_version: 1,
    parser_version: 'construction-read/1.0.0',
    status,
    file: { path, name: path.split(/[\\/]/).pop() as string, size_bytes: null, format, sha256: null },
    coverage: null,
    content: null,
    source_refs: [],
    errors,
  }
}

/**
 * Resolve and screen one model-supplied file path before any worker runs:
 * workspace confinement (which also rejects escaping symlinks, because
 * resolution realpaths first), regular-file presence, and the size cap.
 * @param ctx - the plugin context providing `fs`.
 * @param exec - the current execution, for cwd and cancellation.
 * @param path - the model-supplied path.
 * @param maxFileBytes - the configured size cap.
 * @returns the resolved display path, the OS path for the worker, the session cwd, and the stat.
 * @throws Error with a model-facing rejection message.
 */
export async function resolveScreenedFile(
  ctx: Context,
  exec: ToolExecution,
  path: string,
  maxFileBytes: number,
): Promise<{ displayPath: string; processPath: string; cwd: string; size: number }> {
  if (path.trim().length === 0) throw new Error('file must be a non-empty path')
  const cwd = sessionCwd(exec)
  if (cwd === undefined) throw new Error('a session workspace is required to read construction files')
  const options = { cwd, signal: exec.signal }
  const target = await ctx.fs.resolve(path, options)
  const root = await ctx.fs.resolve('.', options)
  if (!ctx.fs.contains(root, target)) {
    throw new Error(`"${path}" resolves outside the session workspace; only files inside the workspace can be read`)
  }
  const info = await ctx.fs.stat(target, exec.signal)
  if (info === undefined) throw new Error(`"${path}" was not found in the session workspace`)
  if (info.type !== 'file') throw new Error(`"${path}" is not a regular file`)
  /* v8 ignore next -- size-less backends report undefined size; the local backend always reports it. */
  const size = info.size ?? 0
  if (size > maxFileBytes) {
    throw new Error(`"${path}" is ${size} bytes, above the ${maxFileBytes} byte limit; split it with construction_pdf_split or extract the needed part first`)
  }
  exec.signal.throwIfAborted()
  return { displayPath: target.displayPath, processPath: ctx.fs.processPath(target), cwd, size }
}

/**
 * Run one read worker operation and map worker failures to an explicit
 * failed-state result instead of a crash.
 * @param settings - resolved runtime settings.
 * @param exec - the current execution, for cancellation.
 * @param job - the worker job payload.
 * @returns the worker's document result.
 */
export async function runReadOperation(settings: FileToolSettings, exec: ToolExecution, job: unknown): Promise<DocumentResult> {
  try {
    const value = await runPythonJob({
      pythonPath: settings.pythonPath,
      script: settings.readScript,
      job,
      timeoutMs: settings.scriptTimeoutMs,
      maxOutputChars: settings.maxOutputChars,
      signal: exec.signal,
    })
    exec.signal.throwIfAborted()
    return value as DocumentResult
  } catch (error) {
    // The runner rejects only PythonJobError; worker failures become an
    // explicit failed-state result so the model sees the refusal, not a crash.
    const failure = error as PythonJobError
    const requested = typeof (job as { op?: unknown }).op === 'string' ? (job as { op: string }).op : 'read'
    return {
      schema_version: 1,
      parser_version: 'construction-read/1.0.0',
      status: 'failed',
      file: {
        path: typeof (job as { file?: unknown }).file === 'string' ? (job as { file: string }).file : '',
        name: '',
        size_bytes: null,
        format: 'unknown',
        sha256: null,
      },
      coverage: { state: 'failed', requested, actual: 'none', warnings: [] },
      content: null,
      source_refs: [],
      errors: [failure.message],
    }
  }
}

/** Render one document result as model-facing text. */
function renderDocumentResult(value: DocumentResult): string {
  const lines = [
    `file: ${value.file.path} (${value.file.format}, ${value.file.size_bytes ?? 'unknown'} bytes)`,
    `status: ${value.status}`,
  ]
  if (value.coverage !== null) {
    lines.push(`coverage: ${value.coverage.state} — requested ${value.coverage.requested}, actual ${value.coverage.actual}`)
    for (const warning of value.coverage.warnings) lines.push(`warning: ${warning}`)
  }
  for (const error of value.errors) lines.push(`error: ${error}`)
  if (value.status === 'ok') {
    const content = value.content as { match_count?: number } | null
    if (typeof content?.match_count === 'number') {
      lines.push(`matches: ${content.match_count}`)
    }
    lines.push(`source_refs: ${value.source_refs.length}`)
    lines.push(JSON.stringify(value.content))
  }
  return lines.join('\n')
}

const documentOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema_version: { type: 'integer', const: 1 },
    parser_version: { type: 'string' },
    status: { type: 'string', enum: ['ok', 'unsupported', 'rejected', 'failed'] },
    file: { type: 'json' },
    coverage: { type: 'json' },
    content: { type: 'json' },
    source_refs: { type: 'array', items: { type: 'json' } },
    errors: { type: 'array', items: { type: 'string' } },
  },
} as const

/** Screen one input file and run one read worker op, mapping format refusals to results. */
async function screenAndRun(
  ctx: Context,
  settings: FileToolSettings,
  exec: ToolExecution,
  args: { file: string; op: 'inspect' | 'read' | 'search'; query?: string; max_chars?: number },
): Promise<DocumentResult> {
  if (args.file.trim().length === 0) throw new Error('file must be a non-empty path')
  const format = formatOfPath(args.file)
  if (format === 'doc' || format === 'xls') {
    return refusedResult(args.file, format, 'unsupported', [
      `${args.file}: legacy .${format} files are not readable in this release; supply a converted .${format === 'doc' ? 'docx' : 'xlsx'} copy`,
    ])
  }
  if (format === 'macro') {
    return refusedResult(args.file, format, 'rejected', [
      `${args.file}: macro-enabled Office files are never processed; export a macro-free .docx/.xlsx copy and retry`,
    ])
  }
  if (format === 'unknown') {
    return refusedResult(args.file, format, 'rejected', [
      `${args.file}: unsupported format; supported formats are .docx, .xlsx, and .pdf`,
    ])
  }
  const screened = await resolveScreenedFile(ctx, exec, args.file, settings.maxFileBytes)
  const job = {
    op: args.op,
    file: screened.processPath,
    ...(args.query !== undefined ? { query: args.query } : {}),
    ...(args.max_chars !== undefined ? { max_chars: args.max_chars } : {}),
  }
  return runReadOperation(settings, exec, job)
}

/**
 * Register `construction_files_inspect`, `construction_files_read`, and `construction_files_search`.
 * @param ctx - the plugin context providing `fs` and `tools`.
 * @param settings - resolved runtime settings for the read worker.
 */
export function applyFileTools(ctx: Context, settings: FileToolSettings): void {
  ctx.tools.register(defineTool({
    name: 'construction_files_inspect',
    description: 'Inspect a Word (.docx), Excel (.xlsx), or PDF file in the workspace: structure, page/sheet counts, merges, hidden content, tracked changes, comments, encryption, and formula-cache state, with explicit coverage warnings. Read-only.',
    parameters: {
      file: { type: 'string', required: true, description: 'Workspace-relative path of the file to inspect.' },
    },
    output: { schema: documentOutputSchema, render: (_args, value) => [{ type: 'text', text: renderDocumentResult(value as unknown as DocumentResult) }] },
    execute(args, exec) {
      return screenAndRun(ctx, settings, exec, { file: args.file, op: 'inspect' }) as never
    },
  }))

  ctx.tools.register(defineTool({
    name: 'construction_files_read',
    description: 'Read the content of a Word, Excel, or PDF file in the workspace: body blocks, headings, tables with merged cells, cells with formulas and cached values, or per-page text. Every reported block carries a source reference. Read-only.',
    parameters: {
      file: { type: 'string', required: true, description: 'Workspace-relative path of the file to read.' },
      max_chars: { type: 'integer', description: 'Maximum content characters to return; content is truncated with a partial coverage warning.' },
    },
    output: { schema: documentOutputSchema, render: (_args, value) => [{ type: 'text', text: renderDocumentResult(value as unknown as DocumentResult) }] },
    execute(args, exec) {
      return screenAndRun(ctx, settings, exec, {
        file: args.file,
        op: 'read',
        ...(args.max_chars !== undefined ? { max_chars: args.max_chars } : {}),
      }) as never
    },
  }))

  ctx.tools.register(defineTool({
    name: 'construction_files_search',
    description: 'Search for a query string inside a Word, Excel, or PDF file in the workspace and return each match with its source reference (page, sheet and cell, or paragraph/table location). Read-only.',
    parameters: {
      file: { type: 'string', required: true, description: 'Workspace-relative path of the file to search.' },
      query: { type: 'string', required: true, description: 'Text to search for; matching is case-insensitive.' },
    },
    output: { schema: documentOutputSchema, render: (_args, value) => [{ type: 'text', text: renderDocumentResult(value as unknown as DocumentResult) }] },
    execute(args, exec) {
      if (args.query.trim().length === 0) throw new Error('query must be a non-empty string')
      return screenAndRun(ctx, settings, exec, { file: args.file, op: 'search', query: args.query }) as never
    },
  }))
}
