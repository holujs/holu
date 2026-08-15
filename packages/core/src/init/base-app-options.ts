import type { OutputLogLevel } from '#logger/logger.js';
import type { ModuleNormalizer } from '#init/module-normalizer.js';

/**
 * Configs of logger is not added to the providers array as a separate provider but can be directly
 * used by end consumers (i.e., the loggers).
 *
 * If you want this option to have higher priority for your loggers at any level, it is recommended
 * to [create your logger using a `FactoryProvider`][1], where you override the logger methods to set
 * the `OutputLogLevel` based on `baseAppOptions.level`.
 *
 * [1]: https://github.com/holujs/holu/blob/main/examples/04-logger/src/app/modules/pino/patch-logger.ts
 */
export class BaseAppOptions {
  /**
   * If `{ bufferLogs: true }`, all messages are buffered during application initialization
   * and flushed afterwards. This can be useful if you want all messages to be logged by
   * the final logger, which is configured after the application is fully initialized.
   *
   * Set this option to `false` if you are debugging and want logs to be written without delays.
   *
   * Default - `true`.
   */
  bufferLogs?: boolean = true;
  /**
   * Specifies whether to show logs from external modules. An external module
   * is a module that you install using package managers (npm, yarn, etc.).
   *
   * Default - `true`.
   */
  showExternalLogs?: boolean;
  /**
   * Log level (trace, debug, info etc.).
   *
   * Default - `info`.
   */
  logLevel?: OutputLogLevel;
  /**
   * The error stack trace limit.
   *
   * Default - `50`.
   */
  stackTraceLimit?: number = 50;
  /**
   * @experimental
   *
   * Enables runtime modifications of the module graph via `ModuleRegistry.addImport()`, `ModuleRegistry.removeImport()`,
   * and `AppReinitializer.reinit()`. If enabled, the application will use `MutableModuleRegistry` under the hood,
   * which clones module metadata during initialization.
   *
   * Default - `false` (for faster cold starts).
   */
  allowRuntimeReinit?: boolean = false;
  /**
   * @experimental
   *
   * Creates a custom {@link ModuleNormalizer} instance for the early module scanning phase.
   * The application DI container is not available yet when `ModuleRegistry` is created, so this
   * factory is the low-level extension point for replacing the default normalizer.
   */
  moduleNormalizerFactory?: () => ModuleNormalizer;
}
