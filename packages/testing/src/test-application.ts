import type { StaticModule, ProviderBuilder, ExtensionClass, Class, UnionToIntersection, ModRefId, Provider } from '@holu/core';
import { SystemLogMediator } from '@holu/core';
import type { AppOptions } from '@holu/rest';
import { RestApplication } from '@holu/rest';

import type { ExtensionMetaOverrider } from './types.js';
import { TestAppInitializer } from './test-app-initializer.js';
import { TestModuleRegistry } from './test-module-registry.js';

export class TestRestApplication extends RestApplication {
  protected testAppInitializer: TestAppInitializer;
  protected testModuleRegistry: TestModuleRegistry;
  protected appModule: StaticModule;

  /**
   * @param appModule The root module of the application.
   * @param appOptions REST application options.
   */
  static createTestApp(appModule: StaticModule, appOptions?: AppOptions) {
    const app = new this();
    try {
      app.init(appOptions);
      app.appModule = appModule;
      app.appOptions.logLevel ??= 'off';
      app.testModuleRegistry = new TestModuleRegistry(app.log);
      app.testAppInitializer = new TestAppInitializer(app.appOptions, app.testModuleRegistry, app.log);
      return app;
    } catch (err: any) {
      app.handleError(err);
      throw err;
    }
  }

  /**
   * Adds providers to module metadata at any level. Use this method only if the
   * {@link overrideModuleMeta | this.overrideModuleMeta()} method is not suitable for you.
   */
  addProvidersToModule(modRefId: ModRefId, providers: Provider[]) {
    this.testAppInitializer.addProvidersToModule(modRefId, providers);
    return this;
  }

  /**
   * Marks modules as external (those installed via package managers like npm, yarn, etc).
   * As a result, they will not accept app providers that the application exports from
   * the root module. Useful when you want to test how external modules will behave.
   *
   * @param modRefId The module reference ID. If you import the module as an object,
   * it is this object that must be passed to this method.
   */
  markModuleAsExternal(...modRefId: ModRefId[]) {
    this.testModuleRegistry.markModuleAsExternal(...modRefId);
    return this;
  }

  /**
   * Overrides providers from a module metadata at any level if there are matching providers (they have the same tokens)
   * at those levels. Therefore, this method does not always add providers to the DI.
   *
   * @param providers Providers to override.
   */
  overrideModuleMeta(providers: ProviderBuilder | Provider[]) {
    this.testAppInitializer.overrideModuleMeta(providers);
    return this;
  }

  /**
   * Overrides providers at any level in metadata that generate extension groups.
   */
  overrideExtensionMeta<T>(ExtCls: ExtensionClass<T>, override: ExtensionMetaOverrider<T>) {
    this.testAppInitializer.setOverriderConfig({ ExtCls, override });
    return this;
  }

  async getServer() {
    try {
      this.testModuleRegistry.scanRootModule(this.appModule);
      await this.bootstrapApplication(this.testAppInitializer);
      await this.createServerAndBindToListening(this.testAppInitializer);
      return this.server;
    } catch (err: any) {
      this.handleError(err);
      throw err;
    }
  }

  /**
 * ### Plugins
 * 
 * This method allows you to dynamically extend this class using plugins:
 * 
 * ```ts
import { TestRestApplication } from '@holu/testing';

class Plugin1 extends TestRestApplication {
  method1() {
    // ...
    return this;
  }
}

class Plugin2 extends TestRestApplication {
  method2() {
    // ...
    return this;
  }
}

class AppModule {}

TestRestApplication.createTestApp(AppModule)
  .$use(Plugin1, Plugin2)
  .method1()
  .method2()
  .overrideModuleMeta([]);
 * ```
 * 
 * That is, after using the `.$use()` method, you will be able to use plugin methods.
 * Additionally, each method must return `this`.
 * 
 * __Warning__: Plugins cannot use arrow functions as methods, as they will not work.
 */
  $use<T extends [Class<TestRestApplication>, ...Class<TestRestApplication>[]]>(...Plugins: T) {
    Plugins.forEach((Plugin) => {
      Object.getOwnPropertyNames(Plugin.prototype)
        .filter((p) => p != 'constructor')
        .forEach((p) => {
          (this as any)[p] = (Plugin.prototype as any)[p];
        });
    });

    return this as UnionToIntersection<InstanceType<T[number]>> & this;
  }

  protected handleError(err: any) {
    (this.log as PublicLogMediator).updateOutputLogLevel();
    this.log.internalServerError(this, err);
    this.flushLogs();
  }
}

/**
 * This class is needed only to access the protected methods of the `LogMediator` class.
 */
class PublicLogMediator extends SystemLogMediator {
  override updateOutputLogLevel() {
    return super.updateOutputLogLevel();
  }
}
