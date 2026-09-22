import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { PythonJobError, resolvePythonPath, runPythonJob, scrubPythonEnv } from '../src/python.ts'

const node = process.execPath
let dir: string

async function driver(name: string, source: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, source)
  return path
}

/** Await a run expected to reject, asserting the structured failure shape. */
async function failureOf(promise: Promise<unknown>): Promise<PythonJobError> {
  const failure: unknown = await promise.catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(PythonJobError)
  return failure as PythonJobError
}

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('python runner', () => {
  it('runs a job and returns the parsed JSON result', async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-construction-python-spec-'))
    const script = await driver('ok.mjs', [
      "import { readFileSync } from 'node:fs'",
      'const job = JSON.parse(readFileSync(process.argv[2], \'utf8\'))',
      'console.log(JSON.stringify({ ok: true, seen: job.value }))',
    ].join('\n'))
    const value = await runPythonJob({
      pythonPath: node,
      script,
      job: { value: 42 },
      timeoutMs: 10_000,
      maxOutputChars: 10_000,
    })
    expect(value).toEqual({ ok: true, seen: 42 })
  })

  it('maps worker error JSON to a PythonJobError with the worker code', async () => {
    const script = await driver('err.mjs', [
      'console.log(JSON.stringify({ error: { code: \'BAD_RANGE\', message: \'range 9-20 is outside 1-4\' } }))',
      'process.exit(1)',
    ].join('\n'))
    const failure = await failureOf(runPythonJob({ pythonPath: node, script, job: {}, timeoutMs: 10_000, maxOutputChars: 10_000 }))
    expect(failure.code).toBe('BAD_RANGE')
    expect(failure.message).toContain('range 9-20')
  })

  it('reports a nonzero exit without error JSON, keeping stderr', async () => {
    const script = await driver('exit.mjs', 'console.error(\'worker blew up\')\nprocess.exit(3)')
    const failure = await failureOf(runPythonJob({ pythonPath: node, script, job: {}, timeoutMs: 10_000, maxOutputChars: 10_000 }))
    expect(failure.code).toBe('RUNNER_EXIT')
    expect(failure.message).toContain('worker blew up')
  })

  it('rejects malformed JSON output', async () => {
    const script = await driver('badjson.mjs', 'console.log(\'not json at all\')')
    const failure = await failureOf(runPythonJob({ pythonPath: node, script, job: {}, timeoutMs: 10_000, maxOutputChars: 10_000 }))
    expect(failure.code).toBe('RUNNER_BAD_JSON')
  })

  it('kills a hung worker at the timeout', async () => {
    const script = await driver('sleep.mjs', 'setInterval(() => {}, 1000)')
    const started = Date.now()
    const failure = await failureOf(runPythonJob({ pythonPath: node, script, job: {}, timeoutMs: 300, maxOutputChars: 10_000 }))
    expect(failure.code).toBe('RUNNER_TIMEOUT')
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('aborts before dispatch when the signal is already aborted', async () => {
    const script = await driver('ok2.mjs', 'console.log(JSON.stringify({ ok: true }))')
    const controller = new AbortController()
    controller.abort(new Error('caller cancelled'))
    const failure = await failureOf(runPythonJob({
      pythonPath: node,
      script,
      job: {},
      timeoutMs: 10_000,
      maxOutputChars: 10_000,
      signal: controller.signal,
    }))
    expect(failure.code).toBe('RUNNER_ABORTED')
    expect(failure.message).toContain('caller cancelled')
  })

  it('kills the child when the caller signal aborts mid-run', async () => {
    const script = await driver('slow.mjs', 'setTimeout(() => console.log(JSON.stringify({ late: true })), 3000)')
    const controller = new AbortController()
    const pending = runPythonJob({
      pythonPath: node,
      script,
      job: {},
      timeoutMs: 30_000,
      maxOutputChars: 10_000,
      signal: controller.signal,
    })
    setTimeout(() => { controller.abort(new Error('turn ended')) }, 100)
    const failure = await failureOf(pending)
    expect(failure.code).toBe('RUNNER_ABORTED')
  })

  it('renders non-Error abort reasons', async () => {
    const script = await driver('slow2.mjs', 'setTimeout(() => console.log(JSON.stringify({ late: true })), 3000)')
    const controller = new AbortController()
    const pending = runPythonJob({
      pythonPath: node,
      script,
      job: {},
      timeoutMs: 30_000,
      maxOutputChars: 10_000,
      signal: controller.signal,
    })
    setTimeout(() => { controller.abort('plain string reason') }, 100)
    const failure = await failureOf(pending)
    expect(failure.code).toBe('RUNNER_ABORTED')
    expect(failure.message).toContain('plain string reason')
  })

  it('caps oversized output', async () => {
    const script = await driver('big.mjs', 'console.log(\'x\'.repeat(100000))')
    const failure = await failureOf(runPythonJob({ pythonPath: node, script, job: {}, timeoutMs: 10_000, maxOutputChars: 1_000 }))
    expect(failure.code).toBe('RUNNER_OUTPUT_LIMIT')
  })

  it('reports spawn failures for a missing interpreter', async () => {
    const script = await driver('ok3.mjs', 'console.log(JSON.stringify({ ok: true }))')
    const failure = await failureOf(runPythonJob({
      pythonPath: 'definitely-not-a-real-interpreter',
      script,
      job: {},
      timeoutMs: 10_000,
      maxOutputChars: 10_000,
    }))
    expect(failure.code).toBe('RUNNER_SPAWN')
  })

  it('truncates long error excerpts', async () => {
    const script = await driver('longerr.mjs', 'console.error(\'e\'.repeat(1000))\nprocess.exit(1)')
    const failure = await failureOf(runPythonJob({ pythonPath: node, script, job: {}, timeoutMs: 10_000, maxOutputChars: 10_000 }))
    expect(failure.code).toBe('RUNNER_EXIT')
    expect(failure.message.endsWith('...')).toBe(true)
  })

  it('falls back to stdout when stderr is empty', async () => {
    const script = await driver('stdoutfail.mjs', 'console.log(\'partial output without json\')\nprocess.exit(1)')
    const failure = await failureOf(runPythonJob({ pythonPath: node, script, job: {}, timeoutMs: 10_000, maxOutputChars: 10_000 }))
    expect(failure.code).toBe('RUNNER_EXIT')
    expect(failure.message).toContain('partial output without json')
  })

  it('removes the job directory after the run', async () => {
    const script = await driver('ok4.mjs', 'console.log(JSON.stringify({ ok: true }))')
    // Redirect the OS temp for this process so concurrent spec files cannot
    // create job directories beside the ones this test observes.
    const originalTemp = process.env.TEMP
    const privateTemp = await mkdtemp(join(tmpdir(), 'dsh-construction-private-temp-'))
    process.env.TEMP = privateTemp
    try {
      await runPythonJob({ pythonPath: node, script, job: {}, timeoutMs: 10_000, maxOutputChars: 10_000 })
      expect(await readdir(privateTemp)).toEqual([])
    } finally {
      if (originalTemp === undefined) delete process.env.TEMP
      else process.env.TEMP = originalTemp
      await rm(privateTemp, { recursive: true, force: true })
    }
  })
})

describe('scrubPythonEnv', () => {
  it('passes only launcher essentials and the Python settings', () => {
    const env = scrubPythonEnv({
      PATH: '/bin',
      SYSTEMROOT: 'C:\\Windows',
      SECRET_TOKEN: 'x',
      DSH_CONSTRUCTION_THING: 'y',
      HOME: '/root',
    })
    expect(env).toEqual({ PATH: '/bin', SYSTEMROOT: 'C:\\Windows', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' })
  })

  it('omits missing PATH or SYSTEMROOT', () => {
    const env = scrubPythonEnv({})
    expect(env).toEqual({ PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' })
  })
})

describe('resolvePythonPath', () => {
  it('prefers the configured path', () => {
    expect(resolvePythonPath('/usr/bin/python3.13')).toBe('/usr/bin/python3.13')
  })

  it('falls back to the test override, then the platform launcher', () => {
    const original = process.env.DSH_CONSTRUCTION_TEST_PYTHON
    delete process.env.DSH_CONSTRUCTION_TEST_PYTHON
    expect(resolvePythonPath(undefined)).toBe(process.platform === 'win32' ? 'py' : 'python3')
    process.env.DSH_CONSTRUCTION_TEST_PYTHON = '/opt/venv/bin/python'
    expect(resolvePythonPath(undefined)).toBe('/opt/venv/bin/python')
    if (original === undefined) delete process.env.DSH_CONSTRUCTION_TEST_PYTHON
    else process.env.DSH_CONSTRUCTION_TEST_PYTHON = original
  })
})
