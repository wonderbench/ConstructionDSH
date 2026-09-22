/**
 * Host-side runner for the pinned Python document workers.
 *
 * The runner writes the JSON job to a temporary file, launches the
 * interpreter on one worker script with a scrubbed environment, enforces the
 * configured timeout and the caller's abort signal, and parses the single
 * JSON result from stdout. Worker failures arrive as
 * `{"error": {"code", "message"}}` with a nonzero exit; both shapes become a
 * {@link PythonJobError} with the worker's code preserved.
 *
 * @module @deepseek-ai/dsh-construction-runtime/src/python
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A Python worker failure with the worker's stable error code. */
export class PythonJobError extends Error {
  /** Worker error code such as `BAD_RANGE` or `DAMAGED`; `RUNNER_*` for host-side failures. */
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PythonJobError'
    this.code = code
  }
}

/** Runtime knobs for one {@link runPythonJob} call. */
export interface PythonRunnerOptions {
  /** Interpreter executable or launcher (for example `py` or an absolute path). */
  readonly pythonPath: string
  /** Absolute path of the worker script. */
  readonly script: string
  /** Lossless-JSON job payload written to the job file. */
  readonly job: unknown
  /** Milliseconds before the child is killed. */
  readonly timeoutMs: number
  /** Maximum stdout characters accepted before the run fails. */
  readonly maxOutputChars: number
  /** Caller abort signal; aborting kills the child. */
  readonly signal?: AbortSignal | undefined
}

/**
 * Build the scrubbed environment passed to every worker child. Only the
 * interpreter launcher essentials survive; no credentials, proxy variables,
 * or `DSH_CONSTRUCTION_*` values leak into the worker.
 * @param source - the host environment read for PATH/SYSTEMROOT only.
 * @returns the child environment.
 */
export function scrubPythonEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PYTHONIOENCODING: 'utf-8',
    PYTHONDONTWRITEBYTECODE: '1',
  }
  if (source.PATH !== undefined) env.PATH = source.PATH
  if (source.SYSTEMROOT !== undefined) env.SYSTEMROOT = source.SYSTEMROOT
  return env
}

/**
 * Resolve the interpreter: explicit config first, then the test override,
 * then the platform launcher (`py` on Windows, `python3` elsewhere).
 * @param configured - the configured `pythonPath`, when set.
 * @returns the executable passed to spawn.
 */
export function resolvePythonPath(configured: string | undefined): string {
  if (configured !== undefined && configured.trim().length > 0) return configured
  const override = process.env.DSH_CONSTRUCTION_TEST_PYTHON
  if (override !== undefined && override.trim().length > 0) return override
  /* v8 ignore next -- the non-Windows launcher is exercised on POSIX lanes; this host is Windows. */
  return process.platform === 'win32' ? 'py' : 'python3'
}

/** Cap an arbitrary worker stream for an error message. */
function excerpt(text: string, max = 400): string {
  const trimmed = text.trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}...`
}

/**
 * Run one worker script and return its parsed JSON result.
 * @param options - interpreter, script, job payload, limits, and caller signal.
 * @returns the parsed stdout JSON for a zero-exit run.
 * @throws PythonJobError for spawn failures, timeouts, aborts, oversized
 *   output, nonzero exits, and malformed JSON; the job directory is always removed.
 */
export async function runPythonJob(options: PythonRunnerOptions): Promise<unknown> {
  const { pythonPath, script, job, timeoutMs, maxOutputChars, signal } = options
  const dir = await mkdtemp(join(tmpdir(), 'dsh-construction-job-'))
  const jobPath = join(dir, 'job.json')
  try {
    await writeFile(jobPath, JSON.stringify(job), { encoding: 'utf8' })
    return await new Promise<unknown>((resolve, reject) => {
      const child = spawn(pythonPath, [script, jobPath], {
        env: scrubPythonEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let settled = false

      const finish = (error: PythonJobError | null, value?: unknown): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        if (error === null) resolve(value)
        else reject(error)
      }

      const kill = (): void => {
        try {
          child.kill('SIGTERM')
        } catch {
          // The child may already have exited; termination is best-effort.
        }
      }

      const onAbort = (): void => {
        kill()
        const reason: unknown = signal?.reason
        finish(new PythonJobError('RUNNER_ABORTED', `python worker aborted: ${reason instanceof Error ? reason.message : String(reason)}`))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      // Declared before the pre-aborted check so `finish` can always clear it;
      // a synchronous abort between setup steps cannot fire the listener.
      const timer = setTimeout(() => {
        kill()
        finish(new PythonJobError('RUNNER_TIMEOUT', `python worker timed out after ${timeoutMs} ms`))
      }, timeoutMs)
      if (signal?.aborted === true) {
        onAbort()
        return
      }

      child.on('error', (error) => {
        finish(new PythonJobError('RUNNER_SPAWN', `cannot launch ${pythonPath}: ${error.message}`))
      })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
        if (stdout.length > maxOutputChars) {
          kill()
          finish(new PythonJobError('RUNNER_OUTPUT_LIMIT', `python worker output exceeded ${maxOutputChars} characters`))
        }
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-2000)
      })
      child.on('close', (code) => {
        if (settled) return
        if (code !== 0) {
          let parsed: { error?: { code?: unknown; message?: unknown } } | null = null
          try {
            parsed = JSON.parse(stdout) as { error?: { code?: unknown; message?: unknown } }
          } catch {
            parsed = null
          }
          if (parsed?.error && typeof parsed.error.code === 'string' && typeof parsed.error.message === 'string') {
            finish(new PythonJobError(parsed.error.code, parsed.error.message))
            return
          }
          finish(new PythonJobError('RUNNER_EXIT', `python worker exited with code ${String(code)}: ${excerpt(stderr || stdout)}`))
          return
        }
        let value: unknown
        try {
          value = JSON.parse(stdout)
        } catch {
          finish(new PythonJobError('RUNNER_BAD_JSON', `python worker returned malformed JSON: ${excerpt(stdout)}`))
          return
        }
        finish(null, value)
      })
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
