/**
 * Lightweight per-tool task-type checks.
 *
 * A {@link TaskBinding} is minted whenever one of the four construction
 * business skills is loaded through the skill registry (the provider
 * callback) or observed loading through the `skill` tool (the `tools/result`
 * observation). Each mint supersedes the previous binding for the same scope,
 * so older task identifiers go stale. Business tools call
 * {@link TaskBindings.requireTask} before executing; a denial throws a clean,
 * model-facing error that the tool pipeline renders as an ordinary tool
 * failure — never a crash.
 *
 * @module @deepseek-ai/dsh-construction-runtime/src/tasks
 */

import type { TaskBinding, TaskId, TaskType } from './types.ts'

/** The four bundled business skills and the task type each one binds. */
export const SKILL_TASK_TYPES: Readonly<Record<string, TaskType>> = {
  'construction-safety': 'safety',
  'construction-quality': 'quality',
  'construction-cost': 'cost',
  'construction-schedule': 'schedule',
}

/** Skill names that mint a binding, in catalog order. */
export const BUSINESS_SKILLS: readonly string[] = Object.keys(SKILL_TASK_TYPES)

/** Scope used when no agent identity is available at mint time. */
const PLUGIN_SCOPE: unique symbol = Symbol('construction-plugin-scope')

/** A caller identity a binding can be scoped to: an agent object or the plugin fallback. */
export type BindingScope = object | typeof PLUGIN_SCOPE

/**
 * Return whether a loaded skill name binds a construction business task.
 * @param name - skill name as listed by the registry.
 * @returns the bound task type, or undefined for non-business skills.
 */
export function taskTypeOfSkill(name: string): TaskType | undefined {
  return SKILL_TASK_TYPES[name]
}

/**
 * One active task binding per scope. Bindings are keyed by the calling agent
 * when one is observable and fall back to a single plugin-level binding;
 * minting a new binding for a scope supersedes the previous one there.
 */
export class TaskBindings {
  private readonly byScope = new WeakMap<object, TaskBinding>()
  private pluginBinding: TaskBinding | undefined
  private nextId = 1

  /**
   * Mint a new binding for one business skill, superseding any active
   * binding in the same scope.
   * @param scope - the calling agent when known, otherwise the plugin scope.
   * @param skillName - the invoked business skill name.
   * @param skillVersion - optional skill version metadata from frontmatter.
   * @returns the fresh binding.
   */
  mint(scope: BindingScope, skillName: string, skillVersion?: string): TaskBinding {
    const taskType = SKILL_TASK_TYPES[skillName]
    if (taskType === undefined) {
      throw new Error(`construction-runtime: skill "${skillName}" does not bind a business task`)
    }
    const binding: TaskBinding = {
      task_id: `task-${this.nextId}` as TaskId,
      task_type: taskType,
      ...(skillVersion !== undefined ? { skill_version: skillVersion } : {}),
      issued_at: Date.now(),
    }
    this.nextId += 1
    if (scope === PLUGIN_SCOPE) {
      this.pluginBinding = binding
    } else {
      this.byScope.set(scope, binding)
    }
    return binding
  }

  /**
   * Resolve the scope key for one caller.
   * @param agent - the calling agent when the executor supplies one.
   * @returns the agent object as scope, or the plugin fallback scope.
   */
  scopeFor(agent: object | undefined): BindingScope {
    return agent ?? PLUGIN_SCOPE
  }

  /**
   * Read the active binding for one scope; agent scopes fall back to the
   * plugin-level binding minted without agent identity.
   * @param scope - the resolved scope.
   * @returns the active binding, or undefined.
   */
  active(scope: BindingScope): TaskBinding | undefined {
    if (scope === PLUGIN_SCOPE) return this.pluginBinding
    return this.byScope.get(scope) ?? this.pluginBinding
  }

  /**
   * Require an active task binding of an allowed type before a business tool
   * executes. Denials name the loaded skill the model must invoke first, or
   * the identifier mismatch for a stale supplied id.
   * @param scope - the resolved caller scope.
   * @param suppliedTaskId - optional task id the model passed to the tool.
   * @param allowedTypes - task types permitted to run this tool.
   * @returns the active binding.
   * @throws Error with a model-facing denial when no active task matches.
   */
  requireTask(scope: BindingScope, suppliedTaskId: string | undefined, allowedTypes: readonly TaskType[]): TaskBinding {
    const binding = this.active(scope)
    if (binding === undefined) {
      throw new Error(
        `no active construction task: load one of the ${BUSINESS_SKILLS.map(name => `"${name}"`).join(', ')} skills with the skill tool before calling this tool`,
      )
    }
    if (suppliedTaskId !== undefined && suppliedTaskId !== binding.task_id) {
      throw new Error(
        `task "${suppliedTaskId}" is stale or unknown; the active task is "${binding.task_id}" (${binding.task_type}), minted when its skill was loaded — reload the skill to start a new task`,
      )
    }
    if (!allowedTypes.includes(binding.task_type)) {
      throw new Error(
        `task "${binding.task_id}" is a ${binding.task_type} task and cannot run this ${allowedTypes.join('/')} tool; load the matching business skill first`,
      )
    }
    return binding
  }
}
