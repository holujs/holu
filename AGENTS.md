# Holu Framework — Agent Rules

This file provides rules and context for AI agents working inside the **Holu framework monorepo** (specifically on the framework core and packages).

> [!NOTE]
> `@ts-stack/*` packages are always published with their source files in the `src` folder, so agents can utilize them if needed.

## Repository Overview

Holu is a Node.js web framework written in TypeScript (ESM). *Holu* is a Hawaiian word for "to run" — and that's what this framework helps you do: **run scalable server-side applications** on Node.js, powered by DI, TypeScript, and true modularity.

This is a **Yarn workspaces monorepo**. Key top-level directories:

| Directory      | Purpose                                                              |
| -------------- | -------------------------------------------------------------------- |
| `packages/`    | All publishable npm packages (e.g. `@holu/core`, `@holu/rest`) |
| `examples/`    | Runnable example applications demonstrating framework features       |
| `experiments/` | Experimental / in-progress work, not yet part of the public API      |
| `website/`     | Docusaurus documentation site                                        |

English documentation lives at:
`website/i18n/en/docusaurus-plugin-content-docs/current/`

## Documentation

The website is a Docusaurus project. English docs live at:

```
website/i18n/en/docusaurus-plugin-content-docs/current/
  01-basic-components/   # DI, modules, extensions, logger, errors
  02-rest-application/   # REST-specific features
  03-trpc-application/   # tRPC-specific features
  10-guide/              # Coding conventions and guides
  100-deep-dive/         # Internals: app workflow, module manager, init decorators
```

When adding or modifying public API, update the corresponding documentation file.
Run `yarn docs-en` to preview changes locally.

### Documentation Translation & Synchronization Rules for the `website/` Directory

- **Multi-language updates**: When updating website documentation, update both the English and Ukrainian versions.
- **Line-by-line synchronization**: The English and Ukrainian documentation files must always be synchronized line-by-line. For example, if a header starts at line `N` in the Ukrainian version, the corresponding English header must also start at line `N`.
- **Header IDs**: Every header must have an ID in English using the syntax: `## Some header {#some-header}` where `{#some-header}` is the ID. The exact same English ID must also be included in the corresponding Ukrainian header (e.g. `## Заголовок {#some-header}`) to keep anchor links identical and working across both language versions.

## Verification

- **Running Prettier**: The agent must run Prettier to auto-format every new or modified file with the `.ts` extension before finishing changes (e.g., `yarn prettier --write path/to/file.ts`).
- **Running ESLint**: After completing any code changes, the agent must run ESLint. To avoid running it for the entire project (which can cause memory issues), run it only for the modified packages (e.g., `yarn lint packages/cli` from the project root) or specifically for the modified files.
- **Running Tests**: **DO NOT run tests if you only modified comments or documentation files.** Run tests only if there are functional code changes. To run unit tests for a specific package, the agent should run them using the package workspace (e.g., `yarn workspace @holu/cli test` or `yarn --cwd packages/cli test`). Avoid running `yarn test packages/<package-name>` from the root of the project, as this compiles tests for the entire monorepo and can fail due to compilation errors in other packages. If you only modify tests in a specific file, run only that test file (e.g., `yarn workspace @holu/core test dist/init/module-manager.spec.js` instead of running all tests in the package).

## Code style

- **Internal Package Imports**: Never map the current package's own name (e.g., mapping `@holu/schedule` inside the `schedule` package) in `tsconfig.json` `paths` to reference local files. Self-mapping is not allowed; package-name mapping is reserved exclusively for external packages. To import files from the current package (e.g., inside E2E tests), use Node.js subpath imports (like `#src/*` or specific aliases) that resolve to `./src/*` in `tsconfig.json` and `./dist/*` in `package.json`'s `imports` block.
- Do not use barrel files (e.g., `index.ts` files intended to simplify symbol imports), as they increase the likelihood of circular dependencies.
- Do not add horizontal lines (`---`) in Markdown files.

## Language Rules

- **Ukrainian Language**:
  - When communicating or writing in Ukrainian, the English term **"application"** (or **"app"**) must either remain in English, or be translated as **"застосунок"**.
  - **Do NOT** translate it as **"додаток"**.

## Architectural Suggestions

- **Proposing Changes**: If an agent clearly sees that a truly useful architectural feature or improvement is missing in the framework, they are encouraged (and requested) to propose it to the user.

## Tool Usage

- **Prioritize Built-in Agent Tools**: Agents must always prioritize dedicated agent tools (e.g., `view_file`, `grep_search`, `replace_file_content`, `list_dir`). Ask the user for permission to execute Linux utilities (such as `cat`) only when built-in agent tools cannot accomplish the task.
