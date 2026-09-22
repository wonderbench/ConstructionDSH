/** Composer menu grouping, localized labels, descriptions, and icons. */
import type { ComponentType } from 'react'
import type { InputTriggerCandidate } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import {
  IconChecklistOutline14, IconClockOutline16, IconCompactOutline16, IconDownloadOutline16,
  IconGaugeOutline16, IconGoalOutline16, IconPaperPlaneOutline14, IconPlanOutline14,
  IconShieldOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { CommandDescriptor, CommandSection } from '@deepseek-ai/dsh-commands/types'
import type { CommandKey } from './locales.ts'
import { builtinCommandName } from './resolution.ts'
import type { BuiltinCommandName } from './resolution.ts'

/** The menu's three sections, in display order. */
export type MenuSection = 'add' | 'functions' | 'commands'

/**
 * Row names per legacy section, highest usage first; undeclared rows outside
 * both lists close the Commands section in catalog order. A row whose
 * descriptor declares a section leaves these lists for its declared section.
 */
const SECTION_ROWS: Readonly<Record<Exclude<MenuSection, 'functions'>, readonly string[]>> = {
  add: ['file', 'goal', 'plan', 'feedback'],
  commands: ['compact', 'permission', 'model', 'export'],
}

/** The dictionary keys and glyph of one built-in Host command's client face. */
interface HostFace {
  readonly label: CommandKey
  /** Right-side row text; absent renders the row as label + name only. */
  readonly description?: CommandKey
  readonly icon: ComponentType<IconProps>
}

/** Built-in names whose dictionary carries a `description.<name>` key. */
type DescribedCommandName = {
  [K in BuiltinCommandName]: `description.${K}` extends CommandKey ? K : never
}[BuiltinCommandName]

/** One built-in Host command's face, keyed by its dictionary entries. */
function hostFace(
  name: DescribedCommandName,
  icon: ComponentType<IconProps>,
): readonly [DescribedCommandName, HostFace & { readonly description: CommandKey }] {
  return [name, {
    label: `label.${name}`,
    description: `description.${name}`,
    icon,
  }]
}

/** One built-in Host command's label-only face, for rows without right-side text. */
function hostLabelFace(name: BuiltinCommandName, icon: ComponentType<IconProps>): readonly [BuiltinCommandName, HostFace] {
  return [name, { label: `label.${name}`, icon }]
}

/** Built-in Host commands whose client face this package owns. */
const HOST_FACES: ReadonlyMap<BuiltinCommandName, HostFace> = new Map([
  hostFace('goal', IconGoalOutline16),
  hostFace('plan', IconPlanOutline14),
  hostFace('feedback', IconPaperPlaneOutline14),
  hostFace('compact', IconCompactOutline16),
  hostFace('permission', IconShieldOutline16),
  hostFace('export', IconDownloadOutline16),
  hostLabelFace('construction-safety', IconShieldOutline16),
  hostLabelFace('construction-quality', IconChecklistOutline14),
  hostLabelFace('construction-cost', IconGaugeOutline16),
  hostLabelFace('construction-schedule', IconClockOutline16),
])

/**
 * The localized menu face of a catalog row.
 * @param descriptor - effective Host command descriptor.
 * @param t - the `command` namespace translator.
 * @returns title, description when the face declares one, and glyph for a
 * built-in command; undefined for any other row, which keeps its catalog
 * description.
 */
export function builtinRowFace(
  descriptor: CommandDescriptor,
  t: TranslateNS<'command'>,
): Pick<InputTriggerCandidate, 'label' | 'description' | 'icon'> | undefined {
  const name = builtinCommandName(descriptor)
  const face = name === undefined ? undefined : HOST_FACES.get(name)
  return face === undefined
    ? undefined
    : {
      label: t(face.label),
      ...(face.description === undefined ? {} : { description: t(face.description) }),
      icon: face.icon,
    }
}

/**
 * Arrange the empty-query menu: the Add section, then Functions, then
 * Commands. Legacy usage order anchors the Add and Commands lists; a row
 * whose descriptor declares a section groups under its declared heading in
 * catalog order, and undeclared unlisted rows still close Commands in catalog
 * order. Every row carries its section heading.
 * @param rows - the visible candidates in catalog-then-contribution order.
 * @param t - the `command` namespace translator.
 * @param declared - host-descriptor sections by command name; undeclared rows
 *   keep the legacy lists.
 * @returns the sectioned rows.
 */
export function sectionRows(
  rows: readonly InputTriggerCandidate[],
  t: TranslateNS<'command'>,
  declared: ReadonlyMap<string, CommandSection> = new Map(),
): readonly InputTriggerCandidate[] {
  const byName = new Map(rows.map(row => [row.name, row]))
  // Every legacy-listed row was placed above, so a row reaching this fallback
  // is unlisted and closes Commands in catalog order.
  const sectionOf = (name: string): MenuSection => declared.get(name) ?? 'commands'
  const buckets: Record<MenuSection, InputTriggerCandidate[]> = { add: [], functions: [], commands: [] }
  const placed = new Set<string>()
  // Legacy usage order anchors the two legacy sections; a listed row whose
  // descriptor declares another section lands in its declared bucket below.
  for (const section of ['add', 'commands'] as const) {
    for (const name of SECTION_ROWS[section]) {
      const row = byName.get(name)
      if (row === undefined || declared.has(name)) continue
      buckets[section].push(row)
      placed.add(name)
    }
  }
  for (const row of rows) {
    if (placed.has(row.name)) continue
    buckets[sectionOf(row.name)].push(row)
  }
  const heads: Record<MenuSection, string> = {
    add: t('section.add'),
    functions: t('section.functions'),
    commands: t('section.commands'),
  }
  return (['add', 'functions', 'commands'] as const)
    .flatMap(section => buckets[section].map(row => ({ ...row, section: heads[section] })))
}
