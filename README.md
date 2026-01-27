# Docteur

> AdonisJS cold start profiler - Analyze and optimize your application boot time

Docteur is an AdonisJS package that profiles your application's cold start performance. It measures how long each module takes to load and helps you identify bottlenecks in your boot process.

## Installation

```bash
npm install docteur
# or
pnpm add docteur
```

Then configure the package:

```bash
node ace configure docteur
```

## Usage

Run the profiler with:

```bash
node ace docteur:analyze
```

### Options

| Flag                | Description                             | Default         |
| ------------------- | --------------------------------------- | --------------- |
| `--top`             | Number of slowest modules to display    | 20              |
| `--threshold`       | Only show modules slower than this (ms) | 1               |
| `--no-node-modules` | Exclude node_modules from analysis      | false           |
| `--no-group`        | Don't group modules by package          | false           |
| `--entry`           | Custom entry point to profile           | `bin/server.ts` |

### Example Output

```
  Docteur - Cold Start Analysis

  Summary

  Total boot time:       459.26ms
  Total modules loaded:  447
    App modules:         19
    Node modules:        221
    AdonisJS modules:    186
  Module load time:      72.91ms

  Slowest Modules (top 20)

  #   Module                                   Time
  1   bin/server.ts                            2.10ms
  2   he/he.js                                 1.25ms
  3   content-disposition/index.js             1.01ms

  Slowest Packages

  #   Package              Modules  Total
  1   app                  1        2.10ms
  2   .pnpm                1        1.25ms

  ⚡ Provider Lifecycle Times

  #   Provider              Register   Boot       Total
  1   EdgeServiceProvider   0.15ms     2.76ms     2.91ms
  2   HashServiceProvider   0.08ms     1.23ms     1.31ms
  3   AppProvider           0.05ms     0.89ms     0.94ms

  No major issues detected!
```

## How It Works

Docteur measures cold start performance through two complementary approaches:

1. **Module Loading**: Uses Node.js ESM loader hooks to intercept every `import()` and measure how long each module takes to load.

2. **Provider Lifecycle**: Subscribes to AdonisJS's built-in tracing channels (`@adonisjs/application`) to measure the duration of provider lifecycle methods (register, boot, start, ready).

### Provider Timing

AdonisJS emits diagnostic events via Node.js `diagnostics_channel` for each provider lifecycle phase. Docteur subscribes to these channels:

- `adonisjs.provider.register` - Measures `register()` method duration
- `adonisjs.provider.boot` - Measures `boot()` method duration
- `adonisjs.provider.start` - Measures `start()` method duration
- `adonisjs.provider.ready` - Measures `ready()` method duration
- `adonisjs.provider.shutdown` - Measures `shutdown()` method duration

This approach is non-intrusive and uses AdonisJS's official tracing infrastructure.

### Architecture

```
docteur/
├── commands/
│   └── analyze.ts       # Ace command (user entry point)
├── src/
│   ├── profiler/
│   │   ├── loader.ts    # Injected at app startup
│   │   ├── hooks.ts     # Intercepts each module import
│   │   ├── collector.ts # Processes and aggregates data
│   │   └── reporter.ts  # Displays results in terminal
│   └── types.ts         # TypeScript definitions
├── providers/
│   └── docteur_provider.ts  # Registers command in AdonisJS
└── configure.ts         # Package configuration
```

### Execution Flow

```
1. User runs: node ace docteur:analyze
         │
         ▼
2. analyze.ts: Creates a new process with --import loader.ts
         │
         ▼
3. loader.ts: Runs first, registers hooks.ts
         │
         ▼
4. hooks.ts: Intercepts each import()
         │    - "@adonisjs/core" → 15ms
         │    - "edge.js" → 8ms
         │    - "./app/controllers/home.ts" → 2ms
         │    - ... (hundreds of modules)
         ▼
5. AdonisJS app starts normally, HTTP server listens
         │
         ▼
6. analyze.ts: Detects "started HTTP server", requests results
         │
         ▼
7. loader.ts: Sends all timings to parent process via IPC
         │
         ▼
8. collector.ts: Sorts and analyzes data
         │
         ▼
9. reporter.ts: Displays report in terminal
```

### File Responsibilities

#### `commands/analyze.ts`

**The orchestrator**

- User runs `node ace docteur:analyze`
- Creates a new Node.js process with the AdonisJS app
- Injects the profiler via `--import loader.ts`
- Waits for results and displays them

#### `src/profiler/loader.ts`

**The injection point**

- Loaded BEFORE any app code (via `--import`)
- Registers hooks with `module.register()`
- Subscribes to AdonisJS tracing channels via `diagnostics_channel`
- Stores all collected timings (module loads + provider lifecycle)
- Responds to parent when results are requested

#### `src/profiler/hooks.ts`

**The spy**

- Intercepts EVERY `import` in the application
- Measures time for each module with `performance.now()`
- Tracks parent-child relationships between modules
- Sends data to `loader.ts` via MessagePort

#### `src/profiler/collector.ts`

**The analyst**

- Sorts modules by load time
- Groups by package (node_modules, app, etc.)
- Calculates statistics

#### `src/profiler/reporter.ts`

**The presenter**

- Formats results as tables
- Adds colors (red = slow, green = fast)
- Generates recommendations

## IPC Communication

The profiler uses two communication mechanisms:

1. **MessageChannel** (intra-process): Between the loader hooks (worker thread) and the main thread
2. **IPC** (inter-process): Between the child process (profiled app) and parent process (analyze command)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Parent Process (analyze.ts)                                         │
│                                                                      │
│  fork() ◄─── creates child process with IPC                         │
│       │                                                              │
│       │  IPC (process.send / child.on('message'))                   │
│       ▼                                                              │
├──────────────────────────────────────────────────────────────────────┤
│  Child Process (AdonisJS app)                                        │
│                                                                      │
│  ┌────────────────────┐    MessageChannel    ┌────────────────────┐ │
│  │  Main Thread       │◄──────────────────────│  Worker Thread     │ │
│  │  (loader.ts)       │     (port1/port2)     │  (hooks.ts)        │ │
│  │                    │                       │                    │ │
│  │  process.send() ───────► to Parent        │  resolve(), load() │ │
│  └────────────────────┘                       └────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Profiling Overhead

Docteur has **minimal overhead** (~5-10ms) thanks to its non-intrusive design. The profiler:

- Uses ESM loader hooks to measure load times without modifying module source code
- Batches IPC messages to minimize communication overhead
- Only tracks `file://` modules (skips built-in Node.js modules)

The timing values shown in the report reflect the actual load times of your modules. Since we measure at the loader level without source transformation, the overhead is negligible and doesn't affect the accuracy of the measurements.

## Requirements

- AdonisJS v7+
- Node.js 20.6.0+

## License

MIT
