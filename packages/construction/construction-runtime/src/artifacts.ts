/**
 * Shared workspace-artifacts path resolution for the construction tools.
 *
 * Every artifact (split outputs, exported reports) lives under the
 * configured artifacts directory inside the session workspace. Resolution
 * goes through `ctx.fs` so confinement is backend-enforced: a deployment
 * that remaps the workspace still keeps artifacts inside it.
 *
 * @module @deepseek-ai/dsh-construction-runtime/src/artifacts
 */

import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'

/**
 * Resolve one artifacts-relative path against the session workspace and
 * require the result to stay inside it.
 * @param ctx - the plugin context providing `fs`.
 * @param exec - the current execution, for cwd and cancellation.
 * @param artifactsDir - the configured artifacts directory.
 * @param relative - the path below the artifacts directory.
 * @returns the display path and the write target.
 * @throws Error when no workspace exists or the target escapes it.
 */
export async function resolveArtifactTarget(
  ctx: Context,
  exec: ToolExecution,
  artifactsDir: string,
  relative: string,
): Promise<{ displayPath: string; target: FsTarget }> {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined) throw new Error('a session workspace is required to write construction artifacts')
  const options = { cwd, signal: exec.signal }
  const target = await ctx.fs.resolve(`${artifactsDir.replace(/\\/g, '/')}/${relative}`, options)
  const root = await ctx.fs.resolve('.', options)
  if (!ctx.fs.contains(root, target)) throw new Error('the artifacts directory resolves outside the session workspace')
  return { displayPath: target.displayPath, target }
}

/**
 * Output schema shared by every construction export tool: one report file
 * path, a one-line summary, and the unresolved items carried into the export.
 * @returns the frozen `ExportResult` output schema.
 */
export function exportResultSchema(): {
  type: 'object'
  additionalProperties: false
  properties: {
    schema_version: { type: 'integer'; const: 1 }
    path: { type: 'string' }
    summary: { type: 'string' }
    unresolved: { type: 'array'; items: { type: 'string' } }
  }
} {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      schema_version: { type: 'integer', const: 1 },
      path: { type: 'string' },
      summary: { type: 'string' },
      unresolved: { type: 'array', items: { type: 'string' } },
    },
  }
}
