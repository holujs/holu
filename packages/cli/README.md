# @holu/cli

Command Line Interface (CLI) and development tools for the [Holu](https://github.com/holujs/holu) framework.

Provides commands to generate new applications from official starter templates and run applications in development mode with incremental TypeScript watch compilation (with full support for TypeScript Project References / composite builds), graceful process restarts, and asset synchronization.

## Installation

You can install `@holu/cli` locally in your project:

```bash
npm i -D @holu/cli
```

Or globally:

```bash
npm i -g @holu/cli
```

_Note:_ The binary alias `holu` is available when installed.

---

## Commands

### `holu new <directory>`

Creates a new Holu application in the specified directory using official starter templates.

```bash
holu new my-app
```

#### Options:

- `-t, --template <name>`: Starter template to use (`rest`, `rest-monorepo`, `trpc-monorepo`). Default: `"rest"`.
- `-m, --package-manager <name>`: Package manager to use (`npm`, `yarn`, `pnpm`). Default: `"npm"`.
- `--skip-install`: Skip automatic package installation. Default: `false`.
- `--skip-git`: Skip initializing a clean Git repository. Default: `false`.

#### Examples:

```bash
# Create a REST application using Yarn
holu new my-rest-api -m yarn

# Create a tRPC monorepo without installing packages
holu new my-trpc-app -t trpc-monorepo --skip-install
```

---

### `holu start [entryFile]`

Runs the Holu application in development mode. Monitors TypeScript source files, incrementally compiles changes (including cross-package changes in monorepos via TypeScript Project References), and gracefully restarts the Node.js application process.

```bash
holu start
```

#### Options:

- `-p, --project <path>`: Path to TypeScript config file or project directory (supporting TypeScript Project References). Default: `"tsconfig.build.json"`.
- `-e, --exec <binary>`: Binary to execute the entry file. Default: `"node"`.
- `-d, --debug [hostport]`: Run Node.js in debug mode with the `--inspect` flag.
- `--env-file <paths...>`: Environment file(s) to load into `process.env` (Node.js >= v20).
- `--entry-file <file>`: Relative path to the compiled JavaScript entry file. Default: `"dist/main.js"`.
- `--watch-assets <globs...>`: Non-TypeScript asset globs to watch and copy to `dist/` (e.g. `"src/**/*.json"`).
- `--preserve-watch-output`: Do not clear the terminal screen between compilation cycles. Default: `false`.

#### Examples:

```bash
# Start application with custom entry file and inspect debugger enabled
holu start tmp.ts -d 9229

# Start with environment file and asset watcher for JSON files
holu start --env-file .env.local --watch-assets "src/**/*.json"

# Forward extra arguments directly to the child process after `--`
holu start -- --port=8080 --host=0.0.0.0
```

---

## Programmatic API

`@holu/cli` exports its core building blocks for programmatic usage:

```ts
import { WatchCompiler, ProcessManager, AssetWatcher, startCommand, newCommand } from '@holu/cli';
```

## License

MIT
