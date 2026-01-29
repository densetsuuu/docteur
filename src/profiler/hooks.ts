/*
|--------------------------------------------------------------------------
| ESM Loader Hooks
|--------------------------------------------------------------------------
|
| Tracks module loading times and parent-child relationships.
| - resolve: captures which module imported which (for subtree calculation)
| - load: measures how long each module takes to load
|
*/

import type { InitializeHook, LoadHook, ResolveHook } from 'node:module'
import { performance } from 'node:perf_hooks'
import type { MessagePort } from 'node:worker_threads'

let port: MessagePort

export const initialize: InitializeHook<{ port: MessagePort }> = (data) => {
  port = data.port
}

export const resolve: ResolveHook = async (specifier, context, next) => {
  const result = await next(specifier, context)

  if (context.parentURL && result.url.startsWith('file://')) {
    port.postMessage({ type: 'parent', child: result.url, parent: context.parentURL })
  }

  return result
}

export const load: LoadHook = async (url, context, next) => {
  if (!url.startsWith('file://')) {
    return next(url, context)
  }

  const start = performance.now()
  const result = await next(url, context)

  if (result.format === 'module') {
    port.postMessage({ type: 'timing', url, loadTime: performance.now() - start })
  }

  return result
}
