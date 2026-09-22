// A preset row: registers one composer-menu command, named from config.
// Import-free on purpose — the Loader resolves entry modules through Node's
// ESM resolver, which cannot see this workspace's TypeScript sources.
export const name = 'command-contribute'
export const inject = ['commands']

export function apply(ctx, config) {
  ctx.effect(() => ctx.commands.register({
    definitionId: config.definitionId,
    name: config.command,
    description: `fixture command ${config.command}`,
    handler: () => ({ kind: 'success' }),
  }))
}
