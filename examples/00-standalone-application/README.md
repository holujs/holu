## Standalone Application

`StandaloneApplication` bootstraps the full Holu module system (DI, extensions, logger, graceful shutdown) **without an HTTP server**.

Use it when you need Holu's modularity and DI for:
- CLI tools and scripts
- Background workers (e.g. with [`@holu/schedule`](../../packages/schedule))
- Database migrations
- One-off data processing tasks

This example demonstrates:
- **DI**: `GreetingService` is injected into `AppExtension`
- **Extensions**: `AppExtension.stage3()` performs work after the DI tree is fully initialized
- **Lifecycle hooks**: `GreetingService` implements `BeforeShutdown` for resource cleanup

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
npm install
```

## Running

Start from terminal:

```bash
cd examples/00*
npm start
```
