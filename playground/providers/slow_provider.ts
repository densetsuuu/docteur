import type { ApplicationService } from '@adonisjs/core/types'

/**
 * A slow provider for testing docteur profiling.
 * Uses busy-wait to simulate heavy work in lifecycle methods.
 */
export default class SlowProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Busy-wait helper to simulate CPU-intensive work
   */
  #busyWait(ms: number) {
    const start = Date.now()
    while (Date.now() - start < ms) {
      // Busy-wait
    }
  }

  /**
   * Register: ~50ms busy wait (sync)
   */
  register() {
    this.#busyWait(50)
  }

  /**
   * Boot: ~100ms busy wait (async)
   */
  async boot() {
    this.#busyWait(100)
  }

  /**
   * Start: ~30ms busy wait (async)
   */
  async start() {
    this.#busyWait(30)
  }

  /**
   * Ready: ~20ms busy wait (async)
   */
  async ready() {
    this.#busyWait(20)
  }
}
