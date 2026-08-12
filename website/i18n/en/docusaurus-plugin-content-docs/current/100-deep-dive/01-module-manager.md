---
sidebar_position: 1
---

# ModuleManager {#module-manager}

The first stage of processing metadata passed to module decorators (such as `@rootModule` or `@featureModule`) occurs within the `ModuleManager` service.

It recursively scans all modules starting from the root module, passes decorator options through `ModuleNormalizer`, and stores the collected normalized metadata as `NormalizedModuleMeta` instances.

At this phase the application DI container does not exist yet. For framework-level customization, `BaseAppOptions.moduleNormalizerFactory` can create a custom `ModuleNormalizer`; this option is experimental.

## Scanning and Normalization Workflow {#scanning-and-normalization-workflow}

The initialization process begins when the application invokes `moduleManager.scanAppModule(rootModule)`:

1. **Root Module Normalization**: Decorator options of the root module are passed to `ModuleNormalizer`, which validates them and forms initial normalized metadata.
2. **Recursive Dependency Traversal**: `ModuleManager` traverses all modules specified in `imports` and `exports` arrays, building the complete application module map.
3. **Aspect Decorator Execution**: If a module uses extended aspect decorators (such as `@restModule` or custom `@*Aspect`), corresponding module aspects are executed to normalize extended metadata.
4. **Validation and Integrity Checking**: Module imports and exports are verified for correctness and configuration conflicts.

## Dynamic Module Manipulation {#dynamic-module-manipulation}

After scanning completes, `ModuleManager` provides an API for inspecting and programmatically modifying module metadata before `AppInitializer` builds providers and extensions:

- `getMetadata(modRefId)`: Retrieves normalized metadata for a specified module.
- `setImports(modRefId, ...imports)`: Adds module imports to a module's normalized metadata without directly editing its class decorator.
- `removeImport(modRefId, importToFind)`: Removes specific imports from a module's normalized metadata.

This mechanism enables flexible application customization during testing (e.g., swapping modules or providers) or dynamically attaching feature modules at application startup.
