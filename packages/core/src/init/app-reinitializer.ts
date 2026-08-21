import { injectable } from '#di/decorators.js';
import { BaseAppInitializer } from './base-app-initializer.js';
import { MutableModuleRegistry } from './mutable-module-registry.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { LogMediator } from '#logger/log-mediator.js';
import type { PublicLogMediator } from '#logger/system-log-mediator.js';

/**
 * Provides support for reinitializing the application at runtime.
 *
 * This class is useful when you need to dynamically add, remove, or update modules
 * after the application has already started, without restarting the Node.js process.
 *
 * Note that to use `AppReinitializer`, you must set `allowRuntimeReinit: true` in your `AppOptions`.
 *
 * @experimental This feature is currently experimental and its API may change in the future.
 */
@injectable()
export class AppReinitializer {
  constructor(
    protected appInitializer: BaseAppInitializer,
    protected moduleRegistry: MutableModuleRegistry,
    protected log: SystemLogMediator,
  ) {}

  async reinit(autocommit: boolean = true): Promise<void | Error> {
    this.log.flush();
    LogMediator.bufferLogs = true;
    this.log.preserveLogger();
    this.log.startReinitApp(this);
    // Before init new logger, works previous logger.
    try {
      this.moduleRegistry.startTransaction();
      this.appInitializer.bootstrapProvidersPerApp();
      (this.log as PublicLogMediator).updateOutputLogLevel();
    } catch (err) {
      this.log.restorePreviousLogger();
      (this.log as PublicLogMediator).updateOutputLogLevel();
      LogMediator.bufferLogs = false;
      this.log.flush();
      return this.handleReinitError(err);
    }
    // After init new logger, works new logger.
    try {
      await this.appInitializer.bootstrapModulesAndExtensions();
      (this.log as PublicLogMediator).updateOutputLogLevel();
      if (autocommit) {
        this.moduleRegistry.commit();
      } else {
        this.log.skippingAutocommitModulesConfig(this);
      }
      this.log.finishReinitApp(this);
    } catch (err) {
      return this.handleReinitError(err);
    } finally {
      LogMediator.bufferLogs = false;
      this.log.flush();
    }
  }

  protected async handleReinitError(err: unknown) {
    this.log.printReinitError(this, err);
    this.log.startRollbackModuleConfigChanges(this);
    this.moduleRegistry.rollback();
    this.appInitializer.bootstrapProvidersPerApp();
    await this.appInitializer.bootstrapModulesAndExtensions();
    (this.log as PublicLogMediator).updateOutputLogLevel();
    this.log.successfulRollbackModuleConfigChanges(this);
    return err as Error;
  }
}
