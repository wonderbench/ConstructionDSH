/**
 * Display metadata is presentation, never capability: nearly every way of
 * getting it wrong degrades to "this preset has no display text" rather than
 * to a preset that cannot be discovered or mounted. The one exception is a
 * `picker` field that is present but not a boolean: a silent default there
 * would hide a hand-edit behind the very surface the field controls. It also
 * cannot carry identity — `id` is the directory and `trust` is the root, so
 * neither is readable from the file a user can write.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { METADATA_FILE, readPresetMetadata, renderPresetMetadata } from '../src/metadata.ts'

/** Every temp preset directory created by this file, removed after each test. */
const tempDirs: string[] = []
afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A preset directory holding exactly the given metadata text. */
async function presetDir(content?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-preset-meta-'))
  tempDirs.push(dir)
  await mkdir(dir, { recursive: true })
  if (content !== undefined) await writeFile(join(dir, METADATA_FILE), content)
  return dir
}

describe('reading display metadata', () => {
  it('reads a name and a description', async () => {
    const dir = await presetDir('name: 标准模式\ndescription: 完整的编码 agent。\n')

    expect(await readPresetMetadata(dir)).toEqual({ name: '标准模式', description: '完整的编码 agent。' })
  })

  it('treats an absent file as no metadata', async () => {
    // The common case: every preset authored by duplicating another starts
    // without one, and a picker simply falls back to the id.
    expect(await readPresetMetadata(await presetDir())).toEqual({})
  })

  it('treats malformed YAML as no metadata', async () => {
    const dir = await presetDir('name: [unclosed\n')

    // Display text is not worth failing discovery over — the composition
    // beside it still mounts.
    expect(await readPresetMetadata(dir)).toEqual({})
  })

  it.each([
    ['a list', '- name: x\n'],
    ['a scalar', 'just a string\n'],
    ['an empty document', ''],
  ])('treats %s as no metadata', async (_label, content) => {
    expect(await readPresetMetadata(await presetDir(content))).toEqual({})
  })

  it('ignores fields that are not text', async () => {
    const dir = await presetDir('name: 42\ndescription:\n  nested: true\n')

    expect(await readPresetMetadata(dir)).toEqual({})
  })

  it('ignores blank text rather than showing an empty name', async () => {
    const dir = await presetDir('name: "   "\ndescription: ""\n')

    expect(await readPresetMetadata(dir)).toEqual({})
  })

  it('trims surrounding whitespace', async () => {
    const dir = await presetDir('name: "  极简模式  "\n')

    expect(await readPresetMetadata(dir)).toEqual({ name: '极简模式' })
  })

  it('reads a declared order', async () => {
    const dir = await presetDir('name: 标准模式\norder: 1\n')

    expect(await readPresetMetadata(dir)).toEqual({ name: '标准模式', order: 1 })
  })

  it('reads a declared picker opt-out', async () => {
    const dir = await presetDir('name: 创造模式\npicker: false\n')

    expect(await readPresetMetadata(dir)).toEqual({ name: '创造模式', picker: false })
  })

  it('treats an absent picker as visible', async () => {
    expect(await readPresetMetadata(await presetDir('name: 标准模式\n'))).toEqual({ name: '标准模式' })
  })

  it.each([
    ['a string', 'picker: "no"\n'],
    ['a number', 'picker: 0\n'],
    ['a map', 'picker:\n  hidden: true\n'],
  ])('fails loud on a picker that is %s', async (_label, content) => {
    // The one metadata mistake that is not silent: every consumer agrees the
    // preset is visible, so a wrongly-typed field must not pick a side.
    await expect(readPresetMetadata(await presetDir(content))).rejects.toThrow(/"picker" must be a boolean/)
  })

  it('ignores an order that is not a finite number', async () => {
    expect(await readPresetMetadata(await presetDir('order: first\n'))).toEqual({})
    expect(await readPresetMetadata(await presetDir('order: .inf\n'))).toEqual({})
  })

  it('cannot carry identity or trust', async () => {
    const dir = await presetDir('name: mine\nid: standard\ntrust: system\n')

    // A locally authored preset writing `trust: system` must not become a
    // shipped one; identity comes from the directory and the root it sits in.
    expect(await readPresetMetadata(dir)).toEqual({ name: 'mine' })
  })
})

describe('rendering display metadata', () => {
  it('round-trips through a read', async () => {
    const rendered = renderPresetMetadata({ name: '创造模式', description: '可以改自己的组装。' })
    const dir = await presetDir(rendered)

    expect(await readPresetMetadata(dir)).toEqual({ name: '创造模式', description: '可以改自己的组装。' })
  })

  it('stores a declared order', () => {
    expect(renderPresetMetadata({ name: '标准模式', order: 1 })).toBe('name: 标准模式\norder: 1\n')
  })

  it('stores a declared picker opt-out', () => {
    expect(renderPresetMetadata({ name: '创造模式', picker: false })).toBe('name: 创造模式\npicker: false\n')
  })

  it('omits an absent field rather than writing it blank', () => {
    expect(renderPresetMetadata({ name: '极简模式' })).toBe('name: 极简模式\n')
    // Description without a name is legal too: the picker falls back to the id.
    expect(renderPresetMetadata({ description: '只做检索。' })).toBe('description: 只做检索。\n')
  })

  it('renders nothing when there is nothing to store', () => {
    // Clearing both fields removes the file; an empty document would read as
    // an intentional blank name.
    expect(renderPresetMetadata({})).toBeUndefined()
    expect(renderPresetMetadata({ name: '  ', description: '' })).toBeUndefined()
  })
})
