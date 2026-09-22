import { describe, expect, it } from 'vitest'
import { TaskBindings, taskTypeOfSkill } from '../src/tasks.ts'

describe('task bindings', () => {
  it('maps only the four business skills to task types', () => {
    expect(taskTypeOfSkill('construction-cost')).toBe('cost')
    expect(taskTypeOfSkill('construction-schedule')).toBe('schedule')
    expect(taskTypeOfSkill('construction-safety')).toBe('safety')
    expect(taskTypeOfSkill('construction-quality')).toBe('quality')
    expect(taskTypeOfSkill('office-docx')).toBeUndefined()
  })

  it('refuses to mint a binding for a non-business skill', () => {
    const bindings = new TaskBindings()
    expect(() => bindings.mint(bindings.scopeFor(undefined), 'office-docx')).toThrow('does not bind a business task')
  })

  it('mints monotonically increasing task ids per scope', () => {
    const bindings = new TaskBindings()
    const first = bindings.mint(bindings.scopeFor(undefined), 'construction-cost')
    const second = bindings.mint(bindings.scopeFor(undefined), 'construction-cost')
    expect(first.task_id).not.toBe(second.task_id)
    expect(first.task_type).toBe('cost')
    expect(first.issued_at).toBeGreaterThan(0)
  })

  it('records skill version metadata when supplied', () => {
    const bindings = new TaskBindings()
    const binding = bindings.mint(bindings.scopeFor(undefined), 'construction-safety', '1.2.0')
    expect(binding.skill_version).toBe('1.2.0')
  })

  it('scopes bindings per agent when an agent is available, else per plugin', () => {
    const bindings = new TaskBindings()
    const agent = {}
    const pluginBinding = bindings.mint(bindings.scopeFor(undefined), 'construction-cost')
    const agentBinding = bindings.mint(bindings.scopeFor(agent), 'construction-schedule')
    expect(bindings.active(bindings.scopeFor(agent))).toBe(agentBinding)
    expect(bindings.active(bindings.scopeFor({}))).toBe(pluginBinding)
    expect(bindings.active(bindings.scopeFor(undefined))).toBe(pluginBinding)
  })

  it('falls back to the plugin binding for agent scopes without their own binding', () => {
    const bindings = new TaskBindings()
    const pluginBinding = bindings.mint(bindings.scopeFor(undefined), 'construction-cost')
    expect(bindings.active(bindings.scopeFor({}))).toBe(pluginBinding)
  })

  it('supersedes the previous binding in the same scope, making old ids stale', () => {
    const bindings = new TaskBindings()
    const stale = bindings.mint(bindings.scopeFor(undefined), 'construction-cost')
    const current = bindings.mint(bindings.scopeFor(undefined), 'construction-cost')
    expect(() => bindings.requireTask(bindings.scopeFor(undefined), stale.task_id, ['cost'])).toThrow(`task "${stale.task_id}" is stale or unknown`)
    expect(bindings.requireTask(bindings.scopeFor(undefined), current.task_id, ['cost'])).toBe(current)
  })

  it('denies when no task is active', () => {
    const bindings = new TaskBindings()
    expect(() => bindings.requireTask(bindings.scopeFor(undefined), undefined, ['cost'])).toThrow('no active construction task')
  })

  it('denies cross-domain tools with a model-facing message', () => {
    const bindings = new TaskBindings()
    const binding = bindings.mint(bindings.scopeFor(undefined), 'construction-safety')
    expect(() => bindings.requireTask(bindings.scopeFor(undefined), undefined, ['cost'])).toThrow(
      `task "${binding.task_id}" is a safety task and cannot run this cost tool`,
    )
  })

  it('denies an unknown task id even when the type matches', () => {
    const bindings = new TaskBindings()
    bindings.mint(bindings.scopeFor(undefined), 'construction-cost')
    expect(() => bindings.requireTask(bindings.scopeFor(undefined), 'task-999', ['cost'])).toThrow('stale or unknown')
  })

  it('accepts several allowed types', () => {
    const bindings = new TaskBindings()
    const binding = bindings.mint(bindings.scopeFor(undefined), 'construction-quality')
    expect(bindings.requireTask(bindings.scopeFor(undefined), undefined, ['safety', 'quality'])).toBe(binding)
  })
})
