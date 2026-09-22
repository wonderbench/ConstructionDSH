import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ASSETS = fileURLToPath(new URL('../assets/skills/', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

/**
 * Recorded-session scenarios seed a workspace copy of a bundled skill so the
 * skill load stays `{{cwd}}`-rooted. The replayed sessions embed that copy's
 * body and description, so a seed that drifts from the packaged asset breaks
 * replay with no diff pointing at the seed.
 */
const SNAPSHOT_SEEDS = [
  {
    seed: 'snapshots/session/construction-cost-calculate/workspace/.dsh/skills/construction-cost/SKILL.md',
    asset: 'construction-cost/SKILL.md',
  },
  {
    seed: 'snapshots/session/construction-schedule-present/workspace/.dsh/skills/construction-schedule/SKILL.md',
    asset: 'construction-schedule/SKILL.md',
  },
  {
    seed: 'snapshots/session/construction-task-denial/workspace/.dsh/skills/construction-cost/SKILL.md',
    asset: 'construction-cost/SKILL.md',
  },
] as const

describe('snapshot workspace seeds', () => {
  it.each(SNAPSHOT_SEEDS)('$seed byte-matches the bundled $asset', ({ seed, asset }) => {
    const seedBytes = readFileSync(join(REPO_ROOT, seed))
    const assetBytes = readFileSync(join(ASSETS, asset))
    expect(seedBytes.equals(assetBytes), `${seed} drifted from packages/construction/construction-runtime/assets/skills/${asset}; re-copy the asset and refresh the recorded sessions`).toBe(true)
  })
})
