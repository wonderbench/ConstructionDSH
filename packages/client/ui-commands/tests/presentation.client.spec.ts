/**
 * Row-face selection: built-in Host commands resolve their localized label,
 * optional description, and icon by stable definitionId; every other row —
 * including a same-name override without the matching identity — keeps its
 * catalog copy and receives no face.
 */
import { describe, expect, it } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import {
  IconChecklistOutline14, IconClockOutline16, IconGaugeOutline16, IconGoalOutline16, IconShieldOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import { en } from '../src/client/locales.ts'
import { builtinRowFace } from '../src/client/presentation.ts'
import type { CommandDescriptor } from '../src/client/directory.ts'

const t = ((key: string) => en[key as keyof typeof en]) as TranslateNS<'command'>

function descriptor(name: string, over: Partial<CommandDescriptor> = {}): CommandDescriptor {
  return { name, description: 'catalog copy', ...over }
}

describe('builtinRowFace', () => {
  it('the four construction skill rows carry a label and icon with no description', () => {
    const faces = {
      'construction-safety': IconShieldOutline16,
      'construction-quality': IconChecklistOutline14,
      'construction-cost': IconGaugeOutline16,
      'construction-schedule': IconClockOutline16,
    } as const
    for (const name of Object.keys(faces) as Array<keyof typeof faces>) {
      const face = builtinRowFace(descriptor(name, {
        definitionId: CommandDefinitionId(`@deepseek-ai/dsh-construction-runtime/${name}`),
      }), t)
      expect(face).toEqual({ label: en[`label.${name}`], icon: faces[name] })
    }
  })

  it('faces with a description keep it; unknown identities and missing ids get no face', () => {
    const goal = builtinRowFace(descriptor('goal', {
      definitionId: CommandDefinitionId('@deepseek-ai/dsh-command-goal'),
    }), t)
    expect(goal).toEqual({ label: en['label.goal'], description: en['description.goal'], icon: IconGoalOutline16 })
    expect(builtinRowFace(descriptor('deploy'), t)).toBeUndefined()
    // A same-name override without the matching definitionId keeps its own copy.
    expect(builtinRowFace(descriptor('construction-cost'), t)).toBeUndefined()
  })
})
