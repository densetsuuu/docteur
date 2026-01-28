/*
|--------------------------------------------------------------------------
| Package entrypoint
|--------------------------------------------------------------------------
|
| Export values from the package entrypoint as you see fit.
|
*/

export { configure } from './configure.js'

/**
 * Export types for consumers
 */
export type {
  ModuleTiming,
  ProviderTiming,
  ProfileResult,
  ProfileSummary,
  DocteurConfig,
  ResolvedConfig,
  AppFileCategory,
  AppFileGroup,
} from './src/types.js'

/**
 * Export collector class for advanced usage
 */
export { ProfileCollector, type PackageGroup } from './src/profiler/collector.js'

/**
 * Export reporters for custom reporting
 */
export type { Reporter, ReportContext } from './src/profiler/reporters/base_reporter.js'
export { ConsoleReporter } from './src/profiler/reporters/console_reporter.js'
export { TuiReporter } from './src/profiler/reporters/tui_reporter.js'
export {
  colorDuration,
  createBar,
  formatDuration,
  getCategoryIcon,
  getEffectiveTime,
  simplifyUrl,
  ui,
} from './src/profiler/reporters/format.js'

/**
 * Export registries for customization
 */
export {
  categories,
  symbols,
  type CategoryDefinition,
  type SymbolKey,
} from './src/profiler/registries/index.js'
