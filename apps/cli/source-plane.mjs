/**
 * Source-plane resolution redirect for `dsh` source launches.
 *
 * A checkout can hold gitignored `packages/<group>/<pkg>/lib` build outputs
 * beside `src`. The profile loader resolves plugin entrypoints through package
 * `exports` to `lib`, while tsx's tsconfig `paths` project workspace imports to
 * `src`; two module planes split `unique symbol` identities such as
 * `TOOL_RUNTIME_SCHEDULER`, so `ctx.tools[TOOL_RUNTIME_SCHEDULER]` reads
 * `undefined` and the first tool call dies on `undefined.prepare`. This hook
 * redirects every `packages/<group>/<pkg>/lib/**` resolution to its `src`
 * counterpart so one source launch runs one module plane. It is inert when the
 * `src` counterpart is absent (built installs ship `lib` only), and the built
 * bin never registers it, keeping the artifact plane pure.
 * @module source-plane
 */

import { existsSync } from 'node:fs'
import { sep, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Resolve one specifier, redirecting `packages/<group>/<pkg>/lib/x.js` to the
 * existing `packages/<group>/<pkg>/src/x.ts`.
 * @param specifier - requested module specifier.
 * @param context - resolver context handed down the loader chain.
 * @param nextResolve - the next resolver in the chain (tsx first).
 * @returns the resolution, redirected to the source plane when applicable.
 */
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context)
  if (!resolved.url.startsWith('file://')) return resolved
  let path
  try {
    path = fileURLToPath(resolved.url)
  } catch {
    // Non-local file URLs (a remote host in the URL) stay on their resolved plane.
    return resolved
  }
  const marker = `${sep}packages${sep}`
  const index = path.indexOf(marker)
  if (index < 0) return resolved
  const rest = path.slice(index + marker.length).split(sep)
  if (rest.length < 4 || rest[2] !== 'lib') return resolved
  const srcCandidate = join(
    path.slice(0, index + marker.length), rest[0], rest[1], 'src', ...rest.slice(3),
  ).replace(/\.js$/, '.ts')
  if (!existsSync(srcCandidate)) return resolved
  return { ...resolved, url: pathToFileURL(srcCandidate).href }
}
