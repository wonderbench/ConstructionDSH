/** Register the Tool call tree, details renderer, and built-in atomic views. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteHostFacts } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ToolCallTree } from './tool/ToolCallTree.tsx'
import { CONVERSATION_NS as NS, TOOL_NS, toolEn, toolZh } from './locale.ts'
import { askQuestionToolview } from './tool/toolviews/ask-question-row.tsx'
import { bashToolviewSample } from './tool/toolviews/bash-sample.tsx'
import { fileMutationToolview } from './tool/toolviews/file-mutation-row.tsx'
import { readToolview } from './tool/toolviews/read-row.tsx'
import { readImageToolview } from './tool/toolviews/read-image-row.tsx'
import { searchToolview } from './tool/toolviews/search-row.tsx'
import { detailsToolview } from './tool/toolviews/details-row.tsx'
import { todoToolview } from './tool/toolviews/todo-row.tsx'
import { webToolview } from './tool/toolviews/web-row.tsx'

/**
 * Required services: the slot registry, the locale face for the Tool-owned
 * denoise dictionary, and the Remote face carrying the Host home used for POSIX `~`.
 */
export const inject = ['slots', 'remote', 'locale']

/**
 * Mount the whole-Tool renderers and built-in atomic Tool registrations.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const hostInfo: HostObservable<RemoteHostFacts> = {
    getSnapshot: () => ctx.remote.$host,
    subscribe: listener => ctx.on('connection/reset', listener),
  }
  ctx.effect(() => ctx.locale.register(TOOL_NS, { zh: toolZh, en: toolEn }), 'ui-tool: denoise layer dictionaries')
  const tTool = ctx.locale.bind(TOOL_NS)
  const toolInject = () => ({ hooks: { hostInfo }, tTool })
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'tool-call',
    locale: NS,
    children: {
      'tool.call.toolview': { kind: 'keyed', scope: 'session' },
    },
    inject: toolInject,
  }, ToolCallTree))

  ctx.plugin(bashToolviewSample)
  ctx.plugin(readToolview)
  ctx.plugin(readImageToolview)
  ctx.plugin(fileMutationToolview)
  ctx.plugin(searchToolview)
  ctx.plugin(webToolview)
  ctx.plugin(todoToolview)
  ctx.plugin(detailsToolview)
  ctx.plugin(askQuestionToolview)
}
