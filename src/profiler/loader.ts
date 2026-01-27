/*
|--------------------------------------------------------------------------
| Profiler Loader
|--------------------------------------------------------------------------
|
| Entry point for the profiler. Registers ESM hooks and subscribes to
| AdonisJS tracing channels for provider lifecycle timing.
|
*/

import { tracingChannels } from '@adonisjs/application'
import { register } from 'node:module'
import { performance } from 'node:perf_hooks'
import { MessageChannel } from 'node:worker_threads'

const profileStartTime = performance.now()
const { port1, port2 } = new MessageChannel()

const parents = new Map<string, string>()
const loadTimes = new Map<string, number>()

// Provider timing data: Map<providerName, { register, boot, start, ready, shutdown }>
const providerTimings = new Map<string, Record<string, number>>()

// Track provider start times for calculating durations
const providerStartTimes = new Map<string, number>()

type HookMessage =
  | { type: 'parent'; child: string; parent: string }
  | { type: 'timing'; url: string; loadTime: number }

// Listen for batched messages from hooks
port1.on('message', (message: { type: string; messages?: HookMessage[] }) => {
  if (message.type === 'batch' && message.messages) {
    for (const msg of message.messages) {
      if (msg.type === 'parent') {
        parents.set(msg.child, msg.parent)
      } else if (msg.type === 'timing') {
        loadTimes.set(msg.url, msg.loadTime)
      }
    }
  }
})
;(port1 as unknown as { unref?: () => void }).unref?.()

register('./hooks.js', {
  parentURL: import.meta.url,
  data: { port: port2 },
  transferList: [port2],
})

/**
 * Helper to record timing for a provider lifecycle phase.
 */
function recordTiming(providerName: string, phase: string, duration: number) {
  let timing = providerTimings.get(providerName)
  if (!timing) {
    timing = {}
    providerTimings.set(providerName, timing)
  }
  timing[phase] = duration
}

/**
 * Subscribe to AdonisJS provider tracing channels.
 * Uses the exported tracingChannels from @adonisjs/application.
 */

// Empty handler for unused events
const noop = () => {}

// Track which calls are async (so we don't record timing on `end` for async calls)
const asyncCalls = new Set<string>()

/**
 * Creates subscriber handlers for a provider lifecycle phase.
 * Handles both sync (end) and async (asyncEnd) completions.
 *
 * For async functions, Node.js emits: start -> end -> asyncStart -> asyncEnd
 * We need to wait for asyncEnd to get the full duration, not end.
 */
function createPhaseSubscriber(phase: string) {
  return {
    start(message: { provider: { constructor: { name: string } } }) {
      const name = message.provider.constructor.name
      providerStartTimes.set(`${name}:${phase}`, performance.now())
    },
    end(message: { provider: { constructor: { name: string } } }) {
      const name = message.provider.constructor.name
      const key = `${name}:${phase}`
      const endTime = performance.now() // Capture end time immediately
      // Only record on `end` if this is NOT an async call
      // (asyncStart hasn't fired yet, so we check on next tick)
      setTimeout(() => {
        if (!asyncCalls.has(key)) {
          const startTime = providerStartTimes.get(key)
          if (startTime !== undefined) {
            recordTiming(name, phase, endTime - startTime)
            providerStartTimes.delete(key)
          }
        }
      }, 0)
    },
    asyncStart(message: { provider: { constructor: { name: string } } }) {
      const name = message.provider.constructor.name
      asyncCalls.add(`${name}:${phase}`)
    },
    asyncEnd(message: { provider: { constructor: { name: string } } }) {
      const name = message.provider.constructor.name
      const key = `${name}:${phase}`
      const startTime = providerStartTimes.get(key)
      if (startTime !== undefined) {
        recordTiming(name, phase, performance.now() - startTime)
        providerStartTimes.delete(key)
      }
      asyncCalls.delete(key)
    },
    error: noop,
  }
}

// Subscribe to all provider lifecycle phases (each can be sync or async)
tracingChannels.providerRegister.subscribe(createPhaseSubscriber('register'))
tracingChannels.providerBoot.subscribe(createPhaseSubscriber('boot'))
tracingChannels.providerStart.subscribe(createPhaseSubscriber('start'))
tracingChannels.providerReady.subscribe(createPhaseSubscriber('ready'))
tracingChannels.providerShutdown.subscribe(createPhaseSubscriber('shutdown'))

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __docteur__: {
    startTime: number
    getLoadTimes: () => Map<string, number>
    getParents: () => Map<string, string>
    isEnabled: boolean
  }
}

globalThis.__docteur__ = {
  startTime: profileStartTime,
  getLoadTimes: () => loadTimes,
  getParents: () => parents,
  isEnabled: true,
}

if (process.send) {
  process.on('message', (message: { type: string }) => {
    if (message.type === 'getResults') {
      // Convert provider timings to the expected format
      const providers = Array.from(providerTimings.entries()).map(([name, timing]) => ({
        name,
        registerTime: timing.register || 0,
        bootTime: timing.boot || 0,
        startTime: timing.start || 0,
        readyTime: timing.ready || 0,
        shutdownTime: timing.shutdown || 0,
        totalTime:
          (timing.register || 0) + (timing.boot || 0) + (timing.start || 0) + (timing.ready || 0),
      }))

      process.send!({
        type: 'results',
        data: {
          startTime: profileStartTime,
          endTime: performance.now(),
          loadTimes: Object.fromEntries(loadTimes),
          parents: Object.fromEntries(parents),
          providers,
        },
      })
    }
  })
}
