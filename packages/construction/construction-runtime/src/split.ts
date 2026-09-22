/**
 * Mechanical PDF splitting by page range, per page, or top-level bookmark.
 *
 * Pages are copied by the pinned pypdf worker without altering page size,
 * rotation, or scale. Outputs and an index.json land under the configured
 * artifacts directory inside the session workspace; the index records the
 * source hash, original page numbers, output paths, coverage, and the
 * splitter version. Structured-decomposition requests return an explicit
 * unsupported status and never reach a structure extractor.
 *
 * @module @deepseek-ai/dsh-construction-runtime/src/split
 */

import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import { PythonJobError, runPythonJob } from './python.ts'
import { formatOfPath, resolveScreenedFile, type FileToolSettings } from './files.ts'
import type { SplitResult } from './types.ts'

/** Settings for the split tool; extends the file settings with the artifacts directory. */
export interface SplitToolSettings extends FileToolSettings {
  /** Artifacts directory, relative to the session workspace. */
  readonly artifactsDir: string
  /** Absolute path of construction_pdf_split.py. */
  readonly splitScript: string
}

/** Workspace-relative output directory for one split job. */
function jobDir(artifactsDir: string, jobId: string): string {
  return `${artifactsDir.replace(/\\/g, '/')}/splits/${jobId}`
}

/**
 * Register `construction_pdf_split`.
 * @param ctx - the plugin context providing `fs`.
 * @param settings - resolved runtime settings and the artifacts directory.
 */
export function applySplitTool(ctx: Context, settings: SplitToolSettings): void {
  ctx.tools.register(defineTool({
    name: 'construction_pdf_split',
    description: 'Split a workspace PDF into new PDFs by explicit one-based page ranges, one file per page, or top-level bookmark boundaries. Original pages are copied unchanged; each output maps to its original page numbers and an index.json is written under the construction artifacts directory. Structured decomposition requests return an explicit unsupported status.',
    parameters: {
      file: { type: 'string', required: true, description: 'Workspace-relative path of the PDF to split.' },
      by: { type: 'string', required: true, enum: ['range', 'per_page', 'bookmark'], description: 'Split mode: explicit ranges, one output per page, or top-level bookmark boundaries.' },
      ranges: {
        type: 'array',
        description: 'One-based inclusive ranges {from, to}; required when by is range.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            from: { type: 'integer', required: true },
            to: { type: 'integer', required: true },
          },
        },
      },
      mode: { type: 'string', description: 'Structured decomposition modes such as structure or mineru are unsupported and return an explicit status.' },
      task_id: { type: 'string', description: 'Active task binding id, when a business task is running.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          schema_version: { type: 'integer', const: 1 },
          parser_version: { type: 'string' },
          status: { type: 'string', enum: ['ok', 'unsupported'] },
          reason: { type: 'string' },
          job_id: { type: 'string' },
          output_dir: { type: 'string' },
          index_file: { type: 'string' },
          source: { type: 'json' },
          split_by: { type: 'string', enum: ['range', 'per_page', 'bookmark'] },
          outputs: { type: 'array', items: { type: 'json' } },
          coverage: { type: 'json' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderSplitResult(value as unknown as SplitResult),
      }],
    },
    async execute(args, exec) {
      if (args.mode !== undefined) {
        return {
          schema_version: 1 as const,
          parser_version: 'construction-pdf-split/1.0.0',
          status: 'unsupported' as const,
          reason: `structured decomposition (mode "${args.mode}") is not available in this release; mechanical splitting by range, per_page, or bookmark does not reach it`,
        }
      }
      const format = formatOfPath(args.file)
      if (format !== 'pdf') {
        return {
          schema_version: 1 as const,
          parser_version: 'construction-pdf-split/1.0.0',
          status: 'unsupported' as const,
          reason: `${args.file} is not a PDF; only PDF files can be split`,
        }
      }
      const ranges = args.by === 'range'
        ? args.ranges?.map(range => ({ from: range.from, to: range.to }))
        : undefined
      if (args.by === 'range' && (ranges === undefined || ranges.length === 0)) {
        throw new Error('by=range requires at least one {from, to} range')
      }
      const screened = await resolveScreenedFile(ctx, exec, args.file, settings.maxFileBytes)
      const jobId = `split-${randomBytes(6).toString('hex')}`
      const relativeDir = jobDir(settings.artifactsDir, jobId)
      const target = await ctx.fs.resolve(relativeDir, { cwd: screened.cwd, signal: exec.signal })
      const root = await ctx.fs.resolve('.', { cwd: screened.cwd, signal: exec.signal })
      if (!ctx.fs.contains(root, target)) {
        throw new Error('the artifacts directory resolves outside the session workspace')
      }
      const job = {
        file: screened.processPath,
        by: args.by,
        ...(ranges !== undefined ? { ranges } : {}),
        output_dir: ctx.fs.processPath(target),
        job_id: jobId,
      }
      let value: unknown
      try {
        value = await runPythonJob({
          pythonPath: settings.pythonPath,
          script: settings.splitScript,
          job,
          timeoutMs: settings.scriptTimeoutMs,
          maxOutputChars: settings.maxOutputChars,
          signal: exec.signal,
        })
      } catch (error) {
        // The runner rejects only PythonJobError; surface it as a model-facing refusal.
        throw new Error(`PDF splitting failed: ${(error as PythonJobError).message}`)
      }
      exec.signal.throwIfAborted()
      return value as never
    },
  }))
}

/** Render one split result as a compact summary. */
function renderSplitResult(value: SplitResult): string {
  if (value.status === 'unsupported') {
    return `PDF splitting unsupported: ${value.reason ?? 'structured decomposition is not available'}`
  }
  return [
    `split ${value.source?.file ?? ''} (${value.split_by}) into ${value.outputs?.length ?? 0} file(s)`,
    `index: ${value.index_file ?? ''}`,
    `coverage: ${value.coverage?.state ?? ''}`,
    ...(value.coverage?.warnings ?? []).map(warning => `warning: ${warning}`),
  ].join('\n')
}
