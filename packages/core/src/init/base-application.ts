import { BaseAppOptions } from '#init/base-app-options.js';
import type { PublicLogMediator } from '#logger/system-log-mediator.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import type { StaticModule } from '#decorators/module-decorator-options.js';
import type { AppInitializer } from '#init/app-initializer.js';
import { LogMediator } from '#logger/log-mediator.js';
import { ModuleRegistry } from '#init/module-registry.js';
import { MutableModuleRegistry } from '#init/mutable-module-registry.js';
import { ModuleNormalizer } from '#init/module-normalizer.js';
import type { Injector } from '#di/injector.js';
import { SHUTDOWN_SIGNALS } from '#init/hooks.js';

export abstract class BaseApplication {
  protected baseAppOptions: BaseAppOptions;
  protected log: SystemLogMediator;
  protected injectorPerApp?: Injector;
  protected moduleRegistry?: ModuleRegistry;
  protected isShuttingDown = false;
  protected shutdownListeners: (() => void)[] = [];

  /**
   * Enables graceful shutdown hooks by listening to specified system signals.
   * When any of these signals are intercepted, the application initiates its
   * graceful shutdown sequence.
   *
   * @param signals An array of system process signals to listen to.
   */
  enableShutdownHooks(signals: string[] = SHUTDOWN_SIGNALS) {
    signals.forEach((signal) => {
      const listener = () => {
        this.close(signal).catch((err) => {
          this.log.shutdownError(this, `enableShutdownHooks (${signal})`, err);
          process.exit(1);
        });
      };
      process.on(signal, listener);

      this.shutdownListeners.push(() => {
        process.off(signal, listener);
      });
    });
  }

  /**
   * Gracefully shuts down the application by running BeforeShutdown hooks,
   * performing custom package shutdown logic (e.g. closing the HTTP server),
   * running OnShutdown hooks, and exiting the process cleanly.
   *
   * @param signal The signal that triggered the shutdown, if any.
   */
  async close(signal?: string) {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;
    this.cleanShutdownListeners();

    this.log.shutdownStart(this, signal);

    const allInstances = this.getActiveInstances();

    // 1. Run BeforeShutdown hooks
    await this.runShutdownHooks(allInstances, 'beforeShutdown', signal);

    // 2. Perform any custom shutdown hooks (like server closing in RestApplication)
    try {
      await this.customShutdown(signal);
    } catch (err) {
      this.log.shutdownError(this, 'customShutdown', err);
    }

    // 3. Run OnShutdown hooks
    await this.runShutdownHooks(allInstances, 'onShutdown', signal);

    this.log.shutdownComplete(this);
    this.flushLogs();

    // If triggered by a signal, exit process
    if (signal) {
      process.exit(0);
    }
  }

  /**
   * Initializes the application's base settings, configures app log buffering,
   * and adjusts the stack trace limit for better debugging.
   */
  protected init(baseAppOptions?: BaseAppOptions) {
    this.log = new SystemLogMediator({ moduleName: 'app' });
    this.baseAppOptions = { ...new BaseAppOptions(), ...baseAppOptions };
    if (Error.stackTraceLimit == 10) {
      Error.stackTraceLimit = this.baseAppOptions.stackTraceLimit!;
    }

    // Determine whether logs should be collected in a buffer during the bootstrap phase.
    LogMediator.bufferLogs = this.baseAppOptions.bufferLogs;

    // Log the startup event. Note: The actual OutputLogLevel is determined later in the bootstrap.
    this.log.startingHolu(this);
  }

  /**
   * Initializes the ModuleRegistry and starts the recursive scanning process
   * for the root module and all its dependencies.
   */
  protected scanRootModule(appModule: StaticModule) {
    const moduleNormalizer = this.baseAppOptions.moduleNormalizerFactory?.() ?? new ModuleNormalizer();
    if (this.baseAppOptions.allowRuntimeReinit) {
      this.moduleRegistry = new MutableModuleRegistry(this.log, moduleNormalizer);
    } else {
      this.moduleRegistry = new ModuleRegistry(this.log, moduleNormalizer);
    }
    this.moduleRegistry.scanRootModule(appModule);
    return this.moduleRegistry;
  }

  /**
   * Bootstraps the application by sequentially initializing providers, modules, and extensions.
   * It also manages the transition of the Logger from its default state to custom configurations.
   */
  protected async bootstrapApplication(appInitializer: AppInitializer) {
    // Phase 1: The default Logger is active until application-level providers are initialized.
    appInitializer.bootstrapProvidersPerApp();

    // Phase 2: Application-level providers are ready. Re-initialize the Logger with the new configuration.
    this.log = appInitializer.log;
    (this.log as PublicLogMediator).updateOutputLogLevel();

    this.injectorPerApp = await appInitializer.bootstrapModulesAndExtensions();

    // Phase 3: Extensions are initialized. Re-initialize the Logger again to reflect any extension-specific configs.
    this.log = appInitializer.log;
    (this.log as PublicLogMediator).updateOutputLogLevel();
  }

  /**
   * Removes all registered process signal listeners to prevent memory leaks
   * or handling signals multiple times during shutdown.
   */
  protected cleanShutdownListeners() {
    this.shutdownListeners.forEach((removeListener) => removeListener());
    this.shutdownListeners = [];
  }

  /**
   * Scans all active injectors (both application-level and module-level)
   * and collects all singleton instances that have been instantiated.
   */
  protected getActiveInstances(): any[] {
    const activeInjectors: Injector[] = [];
    if (this.injectorPerApp) {
      activeInjectors.push(this.injectorPerApp);
    }
    if (this.moduleRegistry) {
      const moduleInjectors = this.moduleRegistry.injectorsPerMod.values();
      activeInjectors.push(...moduleInjectors);
    }

    const allInstances: any[] = [];
    activeInjectors.forEach((injector) => {
      allInstances.push(...injector.getInstances());
    });
    return allInstances;
  }

  /**
   * Helper method that concurrently executes the specified lifecycle hook
   * (`beforeShutdown` or `onShutdown`) on all gathered active instances
   * using Promise.allSettled(), logging any errors that occur.
   */
  protected async runShutdownHooks(instances: any[], hookName: 'beforeShutdown' | 'onShutdown', signal?: string): Promise<void> {
    const hooks = instances
      .filter((instance) => instance && typeof instance[hookName] == 'function')
      .map(async (instance) => instance[hookName](signal));

    const results = await Promise.allSettled(hooks);
    results.forEach((result) => {
      if (result.status == 'rejected') {
        this.log.shutdownError(this, hookName, result.reason);
      }
    });
  }

  /**
   * A lifecycle extension point that can be overridden by subclasses
   * (e.g., `RestApplication` to close the HTTP server and drain active connections).
   */
  protected async customShutdown(signal?: string): Promise<void> {
    // Overridden by subclasses (e.g. RestApplication to stop http server)
  }

  protected flushLogs() {
    LogMediator.bufferLogs = false;
    this.log.flush();
  }
}
