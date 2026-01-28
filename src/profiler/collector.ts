import type {
  AppFileCategory,
  AppFileGroup,
  ModuleTiming,
  ProfileResult,
  ProfileSummary,
  ProviderTiming,
  ResolvedConfig,
} from '../types.js'
import { categories, type CategoryDefinition } from './registries/index.js'

type ModuleCategory = 'node' | 'adonis' | 'node_modules' | 'user'

export interface PackageGroup {
  name: string
  totalTime: number
  modules: ModuleTiming[]
}

export class ProfileCollector {
  readonly #modules: ModuleTiming[]
  readonly #providers: ProviderTiming[]
  #childrenMap: Map<string, string[]> | null = null

  constructor(modules: ModuleTiming[] = [], providers: ProviderTiming[] = []) {
    this.#modules = modules
    this.#providers = providers
    // Only compute subtree times if not already calculated
    // (avoids recalculating with incomplete dependency graph after filtering)
    if (modules.length > 0 && modules[0].subtreeTime === undefined) {
      this.#computeSubtreeTimes()
    }
  }

  /**
   * Builds a map of parent URL -> children URLs
   */
  #buildChildrenMap(): Map<string, string[]> {
    if (this.#childrenMap) return this.#childrenMap

    this.#childrenMap = new Map()
    for (const module of this.#modules) {
      if (module.parentUrl) {
        const children = this.#childrenMap.get(module.parentUrl) || []
        children.push(module.resolvedUrl)
        this.#childrenMap.set(module.parentUrl, children)
      }
    }
    return this.#childrenMap
  }

  /**
   * Computes subtree time for a module (its load time + all transitive dependencies)
   */
  #computeSubtreeTime(
    url: string,
    moduleMap: Map<string, ModuleTiming>,
    childrenMap: Map<string, string[]>,
    seen: Set<string>
  ): number {
    if (seen.has(url)) return 0 // Prevent cycles
    seen.add(url)

    const module = moduleMap.get(url)
    if (!module) return 0

    let total = module.loadTime
    const children = childrenMap.get(url) || []
    for (const childUrl of children) {
      total += this.#computeSubtreeTime(childUrl, moduleMap, childrenMap, seen)
    }
    return total
  }

  /**
   * Computes subtreeTime for all modules
   */
  #computeSubtreeTimes(): void {
    const moduleMap = new Map(this.#modules.map((m) => [m.resolvedUrl, m]))
    const childrenMap = this.#buildChildrenMap()

    for (const module of this.#modules) {
      module.subtreeTime = this.#computeSubtreeTime(
        module.resolvedUrl,
        moduleMap,
        childrenMap,
        new Set()
      )
    }
  }

  #getEffectiveTime(module: ModuleTiming): number {
    // Use subtreeTime if available, otherwise loadTime
    return module.subtreeTime ?? module.loadTime
  }

  #categorizeModule(url: string): ModuleCategory {
    if (url.startsWith('node:')) return 'node'
    if (url.includes('node_modules/@adonisjs/')) return 'adonis'
    if (url.includes('node_modules/')) return 'node_modules'
    return 'user'
  }

  #categorizeAppFile(url: string): AppFileCategory {
    const path = url.toLowerCase()

    for (const [category, config] of Object.entries(categories) as [
      AppFileCategory,
      CategoryDefinition,
    ][]) {
      if (config.patterns.some((pattern) => path.includes(pattern))) {
        return category
      }
    }

    return 'other'
  }

  #extractPackageName(url: string): string | null {
    const match = url.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
    return match ? match[1] : null
  }

  #sortByTime(modules: ModuleTiming[]): ModuleTiming[] {
    return [...modules].sort((a, b) => this.#getEffectiveTime(b) - this.#getEffectiveTime(a))
  }

  #sumTime(modules: ModuleTiming[]): number {
    return modules.reduce((sum, m) => sum + this.#getEffectiveTime(m), 0)
  }

  groupAppFilesByCategory(): AppFileGroup[] {
    const appModules = this.#modules.filter((m) => this.#categorizeModule(m.resolvedUrl) === 'user')
    const grouped = Object.groupBy(appModules, (m) => this.#categorizeAppFile(m.resolvedUrl))

    return Object.entries(grouped)
      .filter((entry): entry is [AppFileCategory, ModuleTiming[]] => entry[1] !== undefined)
      .map(([category, files]) => ({
        category,
        displayName: categories[category].displayName,
        files: this.#sortByTime(files),
        totalTime: this.#sumTime(files),
      }))
      .sort((a, b) => b.totalTime - a.totalTime)
  }

  groupModulesByPackage(): PackageGroup[] {
    const grouped = Object.groupBy(
      this.#modules,
      (m) => this.#extractPackageName(m.resolvedUrl) || 'app'
    )

    return Object.entries(grouped)
      .filter((entry): entry is [string, ModuleTiming[]] => entry[1] !== undefined)
      .map(([name, mods]) => ({
        name,
        totalTime: this.#sumTime(mods),
        modules: this.#sortByTime(mods),
      }))
      .sort((a, b) => b.totalTime - a.totalTime)
  }

  computeSummary(): ProfileSummary {
    const grouped = Object.groupBy(this.#modules, (m) => this.#categorizeModule(m.resolvedUrl))

    const userModules = grouped.user?.length ?? 0
    const nodeModules = grouped.node_modules?.length ?? 0
    const adonisModules = grouped.adonis?.length ?? 0
    const totalModuleTime = this.#sumTime(this.#modules)
    const totalProviderTime = this.#providers.reduce((sum, p) => sum + p.totalTime, 0)

    return {
      totalModules: this.#modules.length,
      userModules,
      nodeModules,
      adonisModules,
      totalModuleTime,
      totalProviderTime,
      appFileGroups: this.groupAppFilesByCategory(),
    }
  }

  filterModules(config: ResolvedConfig): ModuleTiming[] {
    return this.#modules.filter((module) => {
      if (this.#getEffectiveTime(module) < config.threshold) return false
      if (module.resolvedUrl.startsWith('node:')) return false

      if (!config.includeNodeModules) {
        const category = this.#categorizeModule(module.resolvedUrl)
        if (category === 'node_modules' || category === 'adonis') return false
      }

      return true
    })
  }

  sortByLoadTime(): ModuleTiming[] {
    return this.#sortByTime(this.#modules)
  }

  getTopSlowest(count: number): ModuleTiming[] {
    return this.sortByLoadTime().slice(0, count)
  }

  collectResults(totalTime: number): ProfileResult {
    return {
      totalTime,
      modules: this.#modules,
      providers: this.#providers,
      summary: this.computeSummary(),
    }
  }
}
