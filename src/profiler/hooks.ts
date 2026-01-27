/*
|--------------------------------------------------------------------------
| Module Loader Hooks
|--------------------------------------------------------------------------
|
| ESM loader hooks for tracking module loading times and parent-child
| relationships. Provider timing is handled separately via AdonisJS's
| built-in tracing channels (diagnostics_channel API).
|
*/

import type { MessagePort } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'

interface ResolveContext {
  conditions: string[]
  importAttributes: Record<string, string>
  parentURL?: string
}

interface LoadContext {
  conditions: string[]
  format?: string
  importAttributes: Record<string, string>
}

type NextResolve = (
  specifier: string,
  context?: ResolveContext
) => Promise<{ url: string; format?: string; shortCircuit?: boolean }>

type NextLoad = (
  url: string,
  context?: LoadContext
) => Promise<{
  format: string
  source: string | ArrayBuffer | SharedArrayBuffer
  shortCircuit?: boolean
}>

let port: MessagePort | null = null
const pendingMessages: Array<{ type: string; [key: string]: unknown }> = []
let flushScheduled = false

function flush() {
  flushScheduled = false
  if (pendingMessages.length > 0 && port) {
    port.postMessage({ type: 'batch', messages: pendingMessages.splice(0) })
  }
}

function queueMessage(msg: { type: string; [key: string]: unknown }) {
  pendingMessages.push(msg)
  if (!flushScheduled) {
    flushScheduled = true
    setImmediate(flush)
  }
}

export function initialize(data: { port: MessagePort }) {
  port = data.port
}

/**
 * Resolve hook - tracks parent-child relationships.
 */
export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve
): Promise<{ url: string; format?: string; shortCircuit?: boolean }> {
  const result = await nextResolve(specifier, context)

  if (context.parentURL && result.url.startsWith('file://')) {
    queueMessage({ type: 'parent', child: result.url, parent: context.parentURL })
  }

  return result
}

/**
 * Load hook - tracks module loading times.
 */
export async function load(
  url: string,
  context: LoadContext,
  nextLoad: NextLoad
): Promise<{
  format: string
  source: string | ArrayBuffer | SharedArrayBuffer
  shortCircuit?: boolean
}> {
  if (!url.startsWith('file://')) {
    return nextLoad(url, context)
  }

  const start = performance.now()
  const result = await nextLoad(url, context)
  const loadTime = performance.now() - start

  if (result.format === 'module') {
    queueMessage({ type: 'timing', url, loadTime })
  }

  return result
}
