import { jest } from '@jest/globals';

import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { BaseNormalizedModuleMeta, createAspectMetaProxy, NormalizedModuleMeta } from '#init/normalized-meta.js';
import { ShallowModulesImporter } from '#init/shallow-modules-importer.js';
import { ModuleManager } from '#init/module-manager.js';
import { AppProviders, ImportedProvider } from '#types/metadata-per-mod.js';
import { Level } from '#types/mix.js';
import { StaticModule, ModRefId } from '#decorators/module-decorator-options.js';
import { getImportedProviders, getImportedTokens } from '#utils/get-imports.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { LevelMultiProviderCollision, UnknownExport, NormalizationFailure, ProvidersCollision } from '#error/core-errors.js';
import { ShallowModuleImports } from './types.js';
import { injectable } from '#di/decorators.js';
import type { FactoryProvider, Provider } from '#di/top/types-and-models.js';
import { forwardRef, type ForwardRefFn } from '#di/forward-ref.js';
import { ModuleAspectHandler, ModuleAspectDecorator } from '#decorators/module-aspects.js';
import { Reflector } from '#di/reflector.js';

describe('ShallowModulesImporter', () => {
  class Provider1 {}
  class Provider2 {}
  class Provider3 {}
  class Provider4 {}

  @injectable()
  class MockShallowModulesImporter extends ShallowModulesImporter {
    override moduleName = 'MockModule';
    override normalizedModuleMeta = new NormalizedModuleMeta();
    override shallowModuleImportsMap = new Map<StaticModule, ShallowModuleImports>();
    override importedProvidersPerMod = new Map<any, ImportedProvider>();
    override importedMultiProvidersPerMod = new Map<ModRefId, Provider[]>();
    override importedExtensionProviders = new Map<ModRefId, Provider[]>();

    override exportAppProviders(moduleManager: ModuleManager) {
      return super.exportAppProviders(moduleManager);
    }

    override getResolvedCollisionsPerLevel(level: Level, token1: any) {
      return super.getResolvedCollisionsPerLevel(level, token1);
    }
  }

  class MockModuleManager extends ModuleManager {
    override scanModule(modRefId: ModRefId | ForwardRefFn<ModRefId>) {
      return super.scanModule(modRefId);
    }
  }

  function importModulesShallow(modRefId: ModRefId) {
    moduleManager.scanModule(modRefId);
    return mock.importModulesShallow({
      appProviders: new AppProviders(),
      modRefId,
      moduleManager,
      unfinishedScanModules: new Set(),
    });
  }

  let mock: MockShallowModulesImporter;
  let moduleManager: MockModuleManager;

  beforeEach(() => {
    clearDebugClassNames();
    mock = new MockShallowModulesImporter();
    const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
    jest.spyOn(systemLogMediator, 'externalModuleDetectionFailed').mockImplementation(() => {});
    moduleManager = new MockModuleManager(systemLogMediator);
  });

  describe('exportAppProviders()', () => {
    it('exported providers order', () => {
      @featureModule({
        providersPerMod: [Provider1, Provider2],
        exports: [Provider1, Provider2],
      })
      class Module1 {}

      @featureModule({
        imports: [Module1],
        providersPerMod: [Provider3, Provider4],
        exports: [Module1, Provider3, Provider4],
      })
      class Module2 {}

      @rootModule({
        imports: [Module2],
        exports: [Module2],
      })
      class AppModule {}

      expect(() => moduleManager.scanRootModule(AppModule)).not.toThrow();
      expect(() => mock.exportAppProviders(moduleManager)).not.toThrow();
      expect(getImportedProviders(mock.importedProvidersPerMod)).toEqual([Provider1, Provider2, Provider3, Provider4]);
    });

    it('saving map between token and modules from where need import providers for it', () => {
      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        imports: [Module1],
        providersPerMod: [Provider2],
        exports: [Provider2, Module1],
      })
      class Module2 {}

      @rootModule({
        imports: [Module2],
        providersPerMod: [Provider3],
        exports: [Module2, Provider3],
      })
      class AppModule {}

      expect(() => moduleManager.scanRootModule(AppModule)).not.toThrow();
      expect(() => mock.exportAppProviders(moduleManager)).not.toThrow();
      expect(getImportedProviders(mock.importedProvidersPerMod)).toEqual([Provider1, Provider2, Provider3]);

      const importedProvider = new ImportedProvider();
      importedProvider.modRefId = Module1;
      importedProvider.providers = [Provider1];
      importedProvider.reexporter = Module2;
      expect(mock?.importedProvidersPerMod.get(Provider1)).toEqual(importedProvider);
      importedProvider.modRefId = Module2;
      importedProvider.providers = [Provider2];
      importedProvider.reexporter = AppModule;
      expect(mock?.importedProvidersPerMod.get(Provider2)).toEqual(importedProvider);
      importedProvider.modRefId = AppModule;
      importedProvider.providers = [Provider3];
      importedProvider.reexporter = undefined;
      expect(mock?.importedProvidersPerMod.get(Provider3)).toEqual(importedProvider);
    });

    it('merge providers from reexported modules', () => {
      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [Provider2],
        imports: [Module1],
        exports: [Provider2, Module1],
      })
      class Module2 {}

      @rootModule({
        imports: [Module2],
        exports: [Module2],
      })
      class AppModule {}

      expect(() => moduleManager.scanRootModule(AppModule)).not.toThrow();
      expect(() => mock.exportAppProviders(moduleManager)).not.toThrow();
      expect(getImportedProviders(mock.importedProvidersPerMod)).toEqual([Provider1, Provider2]);
    });

    it('throw collisions per module (import the first and second module in parallel)', () => {
      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useClass: Provider2 }],
        exports: [Provider1],
      })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
        exports: [Module1, Module2],
      })
      class AppModule {}

      expect(() => moduleManager.scanRootModule(AppModule)).not.toThrow();
      const err = new ProvidersCollision('AppModule', [Provider1], ['Module1', 'Module2'], 'Mod');
      expect(() => mock.exportAppProviders(moduleManager)).toThrow(err);
    });

    it('cyclic dependencies between modules', () => {
      @featureModule({
        imports: [forwardRef(() => Module3)],
        exports: [forwardRef(() => Module3)],
      })
      class Module1 {}

      @featureModule({
        imports: [Module1],
        providersPerMod: [Provider1],
        exports: [Provider1, Module1],
      })
      class Module2 {}

      @featureModule({
        imports: [Module2],
        providersPerMod: [Provider2],
        exports: [Provider2, Module2],
      })
      class Module3 {}

      @rootModule({
        imports: [Module3],
        exports: [Module3],
      })
      class AppModule {}

      expect(() => moduleManager.scanRootModule(AppModule)).not.toThrow();
      expect(() => mock.exportAppProviders(moduleManager)).not.toThrow();
      expect(getImportedProviders(mock.importedProvidersPerMod)).toEqual([Provider1, Provider2]);
    });

    it('forbidden reexports providers', () => {
      @featureModule({
        providersPerMod: [Provider1],
      })
      class Module1 {}

      @featureModule({
        imports: [Module1],
        exports: [Provider1],
      })
      class Module2 {}

      @rootModule({ imports: [Module2] })
      class AppModule {}

      const cause = new UnknownExport('Module2', 'Provider1');
      const err = new NormalizationFailure('Module2', cause);
      expect(() => moduleManager.scanRootModule(AppModule)).toThrow(err);
    });

    it('allow reexports module', () => {
      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        imports: [Module1],
        exports: [Module1],
      })
      class Module2 {}

      @rootModule({
        imports: [Module2],
        exports: [Module2],
      })
      class AppModule {}

      expect(() => moduleManager.scanRootModule(AppModule)).not.toThrow();
      expect(() => mock.exportAppProviders(moduleManager)).not.toThrow();
      expect(getImportedProviders(mock.importedProvidersPerMod)).toEqual([Provider1]);
    });

    it('collision in root module', () => {
      class Provider1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useValue: 'one' }],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module2 {}

      @rootModule({ imports: [Module1, Module2], exports: [Module1, Module2] })
      class AppModule {}

      moduleManager.scanRootModule(AppModule);
      let msg = 'Importing providers to AppModule failed: exports from Module1, ';
      msg += 'Module2 causes collision with Provider1';
      expect(() => mock.exportAppProviders(moduleManager)).toThrow(msg);
    });

    it('resolving collision in root module', () => {
      class Provider1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useValue: 'one' }],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
        resolvedCollisionsPerMod: [[Provider1, Module1]],
        exports: [Module1, Module2],
      })
      class AppModule {}

      moduleManager.scanRootModule(AppModule);
      expect(() => mock.exportAppProviders(moduleManager)).not.toThrow();
    });

    it('identical duplicates but not collision with exported providers', () => {
      class Provider1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useValue: 'one' }],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        imports: [Module1],
        providersPerMod: [{ token: Provider1, useValue: 'one' }],
        exports: [Module1, Provider1],
      })
      class Module2 {}

      @rootModule({
        imports: [Module2],
        exports: [Module2],
      })
      class AppModule {}

      moduleManager.scanRootModule(AppModule);
      expect(() => mock.exportAppProviders(moduleManager)).not.toThrow();
    });
  });

  describe('importModulesShallow()', () => {
    class Provider0 {}
    class Provider5 {}
    class Provider6 {}
    class Provider7 {}
    class Provider8 {}
    const overriddenProvider8: Provider = { token: Provider8, useValue: 'overridden' };
    class Provider9 {}

    @featureModule({
      providersPerMod: [Provider0],
      exports: [Provider0],
    })
    class Module0 {}

    @featureModule({
      imports: [Module0],
      providersPerMod: [Provider1, Provider2, Provider3],
      exports: [Module0, Provider1, Provider2, Provider3],
    })
    class Module1 {}

    @featureModule({
      imports: [Module1],
      providersPerMod: [Provider4, Provider5, Provider6, Provider7, Provider8],
      exports: [Module1, Provider5, Provider8],
    })
    class Module2 {}

    @featureModule({
      imports: [Module2],
      providersPerMod: [Provider9, overriddenProvider8],
      exports: [Module2],
    })
    class Module3 {}

    it('should scan modules returned by getModulesToScan() from module aspects', () => {
      @featureModule()
      class ModuleC {}

      class AspectMeta extends BaseNormalizedModuleMeta {}

      class AspectHandler1 extends ModuleAspectHandler<any> {
        override normalize(normalizedModuleMeta: NormalizedModuleMeta): any {
          return createAspectMetaProxy(normalizedModuleMeta, AspectMeta);
        }

        override getModulesToScan(meta: BaseNormalizedModuleMeta) {
          return [ModuleC];
        }
      }

      const someAspect: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((d) => new AspectHandler1(d));

      @someAspect()
      @featureModule()
      class AspectModule {}

      importModulesShallow(AspectModule);

      // Verify that ShallowModulesImporter successfully scanned ModuleC because it was returned by getModulesToScan
      expect(mock.shallowModuleImportsMap.has(ModuleC)).toBe(true);
    });

    it('exporting providers order', () => {
      importModulesShallow(Module3);
      const mod0 = mock.shallowModuleImportsMap.get(Module0);
      expect(mod0?.normalizedModuleMeta.providersPerMod).toEqual([Provider0]);

      const mod1 = mock.shallowModuleImportsMap.get(Module1);
      expect(mod1?.normalizedModuleMeta.providersPerMod).toEqual([Provider1, Provider2, Provider3]);

      const tokensPerMod = getImportedTokens(mod1?.baseImportRegistry.perMod);
      expect(tokensPerMod).toEqual([Provider0]);

      const mod2 = mock.shallowModuleImportsMap.get(Module2);
      expect(mod2?.normalizedModuleMeta.providersPerMod).toEqual([Provider4, Provider5, Provider6, Provider7, Provider8]);

      const tokensPerMod2 = getImportedTokens(mod2?.baseImportRegistry.perMod);
      expect(tokensPerMod2).toEqual([Provider0, Provider1, Provider2, Provider3]);

      const mod3 = mock.shallowModuleImportsMap.get(Module3);
      expect(getImportedTokens(mod3?.baseImportRegistry.perMod)).toEqual([
        Provider0,
        Provider1,
        Provider2,
        Provider3,
        Provider5,
        Provider8,
      ]);
      expect(mod3?.normalizedModuleMeta.providersPerMod).toEqual([Provider9, overriddenProvider8]);
    });

    it('mapping between token and module from where need to import appropriate provider', () => {
      @rootModule({
        imports: [Module3],
      })
      class Module4 {}
      importModulesShallow(Module4);
      expect(mock.normalizedModuleMeta.providersPerMod).toEqual([]);

      expect(mock?.importedProvidersPerMod).toBeDefined();
      const importedProvider = new ImportedProvider();
      importedProvider.modRefId = Module0;
      importedProvider.providers = [Provider0];
      importedProvider.reexporter = Module1;
      expect(mock?.importedProvidersPerMod.get(Provider0)).toEqual(importedProvider);

      importedProvider.modRefId = Module1;
      importedProvider.providers = [Provider1];
      importedProvider.reexporter = Module2;
      expect(mock?.importedProvidersPerMod.get(Provider1)).toEqual(importedProvider);
      importedProvider.providers = [Provider2];
      expect(mock?.importedProvidersPerMod.get(Provider2)).toEqual(importedProvider);
      importedProvider.providers = [Provider3];
      expect(mock?.importedProvidersPerMod.get(Provider3)).toEqual(importedProvider);

      importedProvider.modRefId = Module2;
      importedProvider.providers = [Provider5];
      importedProvider.reexporter = Module3;
      expect(mock?.importedProvidersPerMod.get(Provider5)).toEqual(importedProvider);
      importedProvider.providers = [Provider8];
      expect(mock?.importedProvidersPerMod.get(Provider8)).toEqual(importedProvider);
    });

    it('import Module2 and Module1 with collision - Provider1', () => {
      class Provider1 {}
      class Provider2 {}
      const factory = Reflector.makePropDecorator();

      class ClassWithFactory {
        @factory()
        method1() {}
      }

      @featureModule({
        providersPerMod: [{ token: Provider1, useClass: Provider1 }, Provider2],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [Provider1, { token: Provider2, useFactory: [ClassWithFactory, ClassWithFactory.prototype.method1] }],
        exports: [Provider1, Provider2],
      })
      class Module2 {}

      @rootModule({ imports: [Module1, Module2] })
      class AppModule {}

      const err = new ProvidersCollision('AppModule', [Provider1], ['Module1', 'Module2'], 'Mod');
      expect(() => importModulesShallow(AppModule)).toThrow(err);
    });

    it('import multi providers that has token Provider1', () => {
      class Provider1 {}
      class Provider2 {}

      @featureModule({
        providersPerMod: [
          { token: Provider1, useValue: 'value1 of module1', multi: true },
          { token: Provider1, useValue: 'value2 of module1', multi: true },
          Provider2,
        ],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [
          { token: Provider1, useValue: 'value1 of module2', multi: true },
          { token: Provider1, useValue: 'value2 of module2', multi: true },
          { token: Provider1, useValue: 'value3 of module2', multi: true },
          { token: Provider2, useValue: 'value100' },
        ],
        exports: [Provider1, Provider2],
      })
      class Module2 {}

      @rootModule({ imports: [Module1, Module2] })
      class AppModule {}

      expect(() => importModulesShallow(AppModule)).not.toThrow();
      expect([...mock.importedProvidersPerMod]).toEqual<[any, ImportedProvider][]>([
        [
          Provider2,
          {
            modRefId: Module2,
            providers: [{ token: Provider2, useValue: 'value100' }],
          },
        ],
      ]);
      expect([...mock.importedMultiProvidersPerMod]).toEqual([
        [
          Module1,
          [
            { token: Provider1, useValue: 'value1 of module1', multi: true },
            { token: Provider1, useValue: 'value2 of module1', multi: true },
          ],
        ],
        [
          Module2,
          [
            { token: Provider1, useValue: 'value1 of module2', multi: true },
            { token: Provider1, useValue: 'value2 of module2', multi: true },
            { token: Provider1, useValue: 'value3 of module2', multi: true },
          ],
        ],
      ]);
    });

    it('should throw an error when resolving multi providers duplicates', () => {
      class Provider1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useValue: 'value1 of module1', multi: true }],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useValue: 'value1 of module2', multi: true }],
        exports: [Provider1],
      })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
        resolvedCollisionsPerMod: [[Provider1, Module1]],
      })
      class AppModule {}

      const err = new LevelMultiProviderCollision('AppModule', 'Module1', 'Mod', 'Provider1');
      expect(() => importModulesShallow(AppModule)).toThrow(err);
    });

    it('exporting duplicates with "multi == true" not to throw', () => {
      class Provider1 {}
      class Provider2 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useClass: Provider1, multi: true }, Provider2],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useClass: Provider1, multi: true }],
        exports: [Provider1],
      })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
      })
      class AppModule {}

      expect(() => importModulesShallow(AppModule)).not.toThrow();
    });

    it('exporting duplicates of Provider2, declared in resolvedCollisionsPerMod of root module', () => {
      class Provider1 {}
      class Provider2 {}
      class Provider3 {}
      const factory = Reflector.makePropDecorator();

      class ClassWithFactory {
        @factory()
        method1() {}
      }
      const useFactoryProvider2: FactoryProvider = {
        token: Provider2,
        useFactory: [ClassWithFactory, ClassWithFactory.prototype.method1],
      };

      @featureModule({
        providersPerMod: [Provider1, useFactoryProvider2],
        exports: [Provider1, Provider2],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [Provider2, Provider3],
        exports: [Provider2, Provider3],
      })
      class Module2 {}

      @rootModule({
        imports: [Module2, Module1],
        resolvedCollisionsPerMod: [[Provider2, Module1]],
      })
      class AppModule {}

      expect(() => importModulesShallow(AppModule)).not.toThrow();
      expect([...mock.importedProvidersPerMod]).toEqual<[any, ImportedProvider][]>([
        [Provider2, { modRefId: Module1, providers: [useFactoryProvider2] }],
        [Provider3, { modRefId: Module2, providers: [Provider3] }],
        [Provider1, { modRefId: Module1, providers: [Provider1] }],
      ]);
    });

    it('allow substitute providers from reexported module', () => {
      class Provider1 {}
      const factory = Reflector.makePropDecorator();

      class ClassWithFactory {
        @factory()
        method1() {}
      }
      const useFactoryProvider2: FactoryProvider = {
        token: Provider1,
        useFactory: [ClassWithFactory, ClassWithFactory.prototype.method1],
      };

      @featureModule({
        providersPerMod: [useFactoryProvider2],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        imports: [Module1],
        providersPerMod: [Provider1],
        exports: [Module1, Provider1],
      })
      class Module2 {}

      @rootModule({ imports: [Module2] })
      class AppModule {}

      expect(() => importModulesShallow(AppModule)).not.toThrow();
      expect([...mock.importedProvidersPerMod]).toEqual<[any, ImportedProvider][]>([
        [Provider1, { modRefId: Module2, providers: [Provider1] }],
      ]);
    });

    it('exporting duplicates in Module2 (with params), but declared in resolvedCollisionsPerMod of root module', () => {
      class Provider1 {}
      class Provider2 {}

      @featureModule({
        providersPerMod: [Provider1, Provider2],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useClass: Provider1 }, Provider2],
        exports: [Provider1, Provider2],
      })
      class Module2 {
        static withOpts() {
          return { module: Module2 };
        }
      }

      const baseDynamicModule = Module2.withOpts();

      @rootModule({
        imports: [Module1, baseDynamicModule],
        resolvedCollisionsPerMod: [[Provider1, Module1]],
      })
      class AppModule {}

      expect(() => importModulesShallow(AppModule)).not.toThrow();
      expect([...mock.importedProvidersPerMod]).toEqual<[any, ImportedProvider][]>([
        [Provider1, { modRefId: Module1, providers: [Provider1] }],
        [Provider2, { modRefId: baseDynamicModule, providers: [Provider2] }],
      ]);
    });

    it('resolved collision for feature module', () => {
      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useValue: 'one' }],
        exports: [Provider1],
      })
      class Module2 {}

      @featureModule({
        imports: [Module1, Module2],
        resolvedCollisionsPerMod: [[Provider1, Module1]],
        exports: [Module1, Module2],
      })
      class Module3 {}

      @rootModule({
        imports: [Module3],
        resolvedCollisionsPerMod: [[Provider1, Module2]],
      })
      class AppModule {}

      expect(() => importModulesShallow(AppModule)).not.toThrow();
      const mod3 = mock.shallowModuleImportsMap.get(Module3)!;
      expect([...mod3.baseImportRegistry.perMod]).toEqual([[Provider1, { modRefId: Module1, providers: [Provider1] }]]);
      expect([...mock.importedProvidersPerMod]).toEqual<[any, ImportedProvider][]>([
        [Provider1, { modRefId: Module2, providers: [{ token: Provider1, useValue: 'one' }] }],
      ]);
    });

    it('for feature module', () => {
      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useValue: 'one' }],
        exports: [Provider1],
      })
      class Module2 {}

      @featureModule({
        providersPerApp: [{ token: 'token1', useValue: 'value1' }],
        imports: [Module1, Module2],
      })
      class Module3 {}

      @rootModule({
        imports: [Module3],
      })
      class AppModule {}

      const err = new ProvidersCollision('Module3', [Provider1], ['Module1', 'Module2'], 'Mod');
      expect(() => importModulesShallow(AppModule)).toThrow(err);
    });

    it('exporting duplicates of Provider2', () => {
      @featureModule({
        exports: [Provider1, Provider2],
        providersPerMod: [{ token: Provider1, useToken: Provider1 }, Provider2],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [{ token: Provider2, useClass: Provider2 }, Provider3],
        exports: [Provider2, Provider3],
      })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
      })
      class AppModule {}

      const err = new ProvidersCollision('AppModule', [Provider2], ['Module1', 'Module2'], 'Mod');
      expect(() => importModulesShallow(AppModule)).toThrow(err);
    });

    it('exporting duplicates of Provider2, but declared in resolvedCollisionsPerMod of root module', () => {
      @featureModule({
        providersPerMod: [{ token: Provider1, useToken: Provider1 }, Provider2],
        exports: [Provider1, Provider2],
      })
      class Module1 {}

      @featureModule({
        imports: [Module1],
        providersPerMod: [{ token: Provider2, useClass: Provider2 }, Provider3],
        exports: [Module1, Provider2, Provider3],
      })
      class Module2 {}

      @rootModule({
        imports: [Module2],
        resolvedCollisionsPerMod: [[Provider2, Module2]],
      })
      class AppModule {}

      expect(() => importModulesShallow(AppModule)).not.toThrow();
      expect([...mock.importedProvidersPerMod]).toEqual<[any, ImportedProvider][]>([
        [
          Provider1,
          {
            modRefId: Module1,
            providers: [{ token: Provider1, useToken: Provider1 }],
            reexporter: Module2,
          },
        ],
        [Provider2, { modRefId: Module2, providers: [{ token: Provider2, useClass: Provider2 }] }],
        [Provider3, { modRefId: Module2, providers: [Provider3] }],
      ]);
    });

    it('exporting duplicates of Provider1 from Module1 and Module2', () => {
      @featureModule({
        providersPerMod: [{ token: Provider1, useClass: Provider1 }, Provider2],
        exports: [Provider1],
      })
      class Module0 {}

      @featureModule({
        providersPerMod: [{ token: Provider1, useToken: Provider1 }, Provider2],
        exports: [Provider1, Provider2],
      })
      class Module1 {}

      @rootModule({
        imports: [Module0, Module1],
      })
      class AppModule {}

      const err = new ProvidersCollision('AppModule', [Provider1], ['Module0', 'Module1'], 'Mod');
      expect(() => importModulesShallow(AppModule)).toThrow(err);
    });

    it('exporting duplicates of Provider1 from Module1 and Module2, but also includes in resolvedCollisionsPerMod of root module', () => {
      @featureModule({
        providersPerMod: [{ token: Provider1, useClass: Provider2 }, Provider2],
        exports: [Provider1, Provider2],
      })
      class Module1 {}

      @featureModule({
        providersPerMod: [
          { token: Provider1, useToken: Provider1 },
          { token: Provider2, useToken: Provider1 },
        ],
        exports: [Provider1, Provider2],
      })
      class Module2 {}

      @rootModule({
        imports: [Module1, Module2],
        resolvedCollisionsPerMod: [
          [Provider1, Module2],
          [Provider2, Module1],
        ],
      })
      class AppModule {}

      expect(() => importModulesShallow(AppModule)).not.toThrow();
      expect([...mock.importedProvidersPerMod]).toEqual<[any, ImportedProvider][]>([
        [Provider1, { modRefId: Module2, providers: [{ token: Provider1, useToken: Provider1 }] }],
        [Provider2, { modRefId: Module1, providers: [Provider2] }],
      ]);
    });
  });
});
