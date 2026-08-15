import type { PublicLogMediator } from '#logger/system-log-mediator.js';
import type { StaticModule } from '#decorators/module-decorator-options.js';
import { AppInitializer } from './app-initializer.js';
import type { BaseAppOptions } from './base-app-options.js';
import { BaseApplication } from './base-application.js';

/**
 * This class is primarily used for testing `@holu/core`, and for demonstrating how the application works without a web server.
 * It can also be used as a basic example for building a full-fledged web application (or another backend application that requires
 * modularity, Dependency Injection, a logger, and extension handling).
 */
export class StandaloneApplication extends BaseApplication {
  /**
   * The entry point for creating and bootstrapping a standalone application.
   *
   * This method orchestrates the entire lifecycle of application startup:
   * 1. Initializes base settings and logging.
   * 2. Scans the root module and its dependency tree.
   * 3. Bootstraps providers, modules, and extensions.
   * 4. Handles startup errors by logging them.
   *
   * @param appModule The root module of the application.
   * @param baseOptions App options for the application bootstrap process.
   * @returns An instance of StandaloneApplication.
   */
  static async create(appModule: StaticModule, baseOptions?: BaseAppOptions) {
    const app = new this();
    try {
      app.init(baseOptions);
      const moduleRegistry = app.scanRootModule(appModule);
      const appInitializer = new AppInitializer(app.baseAppOptions, moduleRegistry, app.log);
      await app.bootstrapApplication(appInitializer);
      return app;
    } catch (err: any) {
      // Ensure the logger uses the correct level before reporting the fatal error.
      (app.log as PublicLogMediator).updateOutputLogLevel();
      app.log.internalServerError(app, err);

      // Flush buffered logs to ensure the error message is actually printed before exit.
      app.flushLogs();
      process.exit(1);
    }
  }
}
