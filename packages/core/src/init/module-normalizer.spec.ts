import { featureModule } from '#decorators/feature-module.js';
import { StaticAspectOptions, ModuleAspectHandler, ModuleAspectDecorator } from '#decorators/module-aspects.js';
import { BaseNormalizedModuleMeta, createAspectMetaProxy, NormalizedModuleMeta } from '#init/normalized-meta.js';
import { rootModule, RootModuleOptions } from '#decorators/root-module.js';
import { Reflector } from '#di/reflector.js';
import { Extension } from '#extension/extension-types.js';
import { AnyObj } from '#types/mix.js';
import { ModRefId, type StaticModule } from '#decorators/module-decorator-options.js';
import {
  DynamicModuleOptions,
  FeatureModuleOptions,
  DynamicModuleWithAspectOptions,
  DynamicModule,
} from '#decorators/module-decorator-options.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { ModuleNormalizer } from './module-normalizer.js';
import { ProviderBuilder } from '#utils/providers.js';
import {
  UnknownExport,
  ForbiddenNormalizedExport,
  ForbiddenAppExport,
  InvalidExtension,
  InvalidModRefId,
  MissingModuleDecorator,
  EmptyModuleMeta,
  ReexportFailure,
  ResolvedCollisionTokensOnly,
  UndefinedSymbol,
} from '#error/core-errors.js';
import { injectable } from '#di/decorators.js';
import type { MultiProvider } from '#di/utils.js';
import { forwardRef } from '#di/forward-ref.js';
import { KeyRegistry } from '#di/key-registry.js';
import { isDynamicModule } from '#decorators/type-guards.js';
import { DecoratorMeta } from '#di/top/decorator-and-value.js';

describe('ModuleNormalizer', () => {
  class MockModuleNormalizer extends ModuleNormalizer {
    override normalize(modRefId: ModRefId): NormalizedModuleMeta {
      return super.normalize(modRefId, { externalModuleDetectionFailed: () => {} } as any);
    }
  }

  let normalizer: MockModuleNormalizer;

  beforeEach(() => {
    clearDebugClassNames();
    normalizer = new MockModuleNormalizer();
  });

  describe('base module metadata', () => {
    it('normalizes an empty root module without requiring providers, exports, extensions, or module aspects', () => {
      @rootModule()
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta).toBeInstanceOf(NormalizedModuleMeta);
    });

    it('normalizes imports, exports, providers, resolved collisions, and extension metadata from rootModule options', () => {
      class AppService {}
      class ModService {}
      class RouService {}
      class ReqService {}
      class MultiService {}

      @injectable()
      class Extension1 implements Extension {
        async stage1() {
          return;
        }
      }

      @featureModule()
      class ImportedModule {}

      @featureModule()
      class ImportedDynamicModule {}

      const dynamicModule: DynamicModule = { module: ImportedDynamicModule, id: 'dynamic-id' };
      const multiProvider: MultiProvider = { token: MultiService, useValue: 'multi-value', multi: true };

      @rootModule({
        imports: [ImportedModule, dynamicModule],
        providersPerApp: new ProviderBuilder().passThrough(AppService),
        providersPerMod: [ModService, multiProvider],
        providersPerRou: [RouService],
        providersPerReq: [ReqService],
        resolvedCollisionsPerApp: [[AppService, ImportedModule]],
        resolvedCollisionsPerMod: [[ModService, ImportedDynamicModule]],
        resolvedCollisionsPerRou: [[RouService, ImportedModule]],
        resolvedCollisionsPerReq: [[ReqService, ImportedDynamicModule]],
        extensions: [{ extension: Extension1, export: true }],
        extensionsMeta: { feature: 'enabled' },
        exports: [ModService, RouService, ReqService, MultiService, ImportedModule],
      })
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta.declaredInDir).toEqual(expect.any(String));
      expect(normalizedModuleMeta.importedStaticModules).toEqual([ImportedModule]);
      expect(normalizedModuleMeta.importedDynamicModules).toEqual([dynamicModule]);
      expect(normalizedModuleMeta.exportedStaticModules).toEqual([ImportedModule]);
      expect(normalizedModuleMeta.providersPerApp).toEqual([AppService]);
      expect(normalizedModuleMeta.providersPerMod).toEqual([ModService, multiProvider]);
      expect(normalizedModuleMeta.providersPerRou).toEqual([RouService]);
      expect(normalizedModuleMeta.providersPerReq).toEqual([ReqService]);
      expect(normalizedModuleMeta.exportedProvidersPerMod).toEqual([ModService]);
      expect(normalizedModuleMeta.exportedProvidersPerRou).toEqual([RouService]);
      expect(normalizedModuleMeta.exportedProvidersPerReq).toEqual([ReqService]);
      expect(normalizedModuleMeta.exportedMultiProvidersPerMod).toEqual([multiProvider]);
      expect(normalizedModuleMeta.exportedMultiProvidersPerRou).toEqual([]);
      expect(normalizedModuleMeta.exportedMultiProvidersPerReq).toEqual([]);
      expect(normalizedModuleMeta.resolvedCollisionsPerApp).toEqual([[AppService, ImportedModule]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerMod).toEqual([[ModService, ImportedDynamicModule]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerRou).toEqual([[RouService, ImportedModule]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerReq).toEqual([[ReqService, ImportedDynamicModule]]);
      expect(normalizedModuleMeta.extensionProviders).toEqual([Extension1]);
      expect(normalizedModuleMeta.exportedExtensionProviders).toEqual([Extension1]);
      expect(normalizedModuleMeta.extensionsMeta).toEqual({ feature: 'enabled' });
    });

    it('normalizes resolved collisions when dynamic modules are passed directly', () => {
      class AppService {}
      class ModService {}
      class RouService {}
      class ReqService {}

      @featureModule()
      class ImportedModule {}

      const dynamicModule: DynamicModule = { module: ImportedModule, id: 'dynamic-id' };

      @rootModule({
        imports: [dynamicModule],
        resolvedCollisionsPerApp: [[AppService, dynamicModule]],
        resolvedCollisionsPerMod: [[ModService, dynamicModule]],
        resolvedCollisionsPerRou: [[RouService, dynamicModule]],
        resolvedCollisionsPerReq: [[ReqService, dynamicModule]],
      })
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta.resolvedCollisionsPerApp).toEqual([[AppService, dynamicModule]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerMod).toEqual([[ModService, dynamicModule]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerRou).toEqual([[RouService, dynamicModule]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerReq).toEqual([[ReqService, dynamicModule]]);
    });

    it('normalizes resolved collisions when dynamic modules are passed via forwardRef', () => {
      class AppService {}
      class ModService {}
      class RouService {}
      class ReqService {}

      @featureModule()
      class ImportedModule {}

      const dynamicModule: DynamicModule = { module: ImportedModule, id: 'dynamic-id' };

      @rootModule({
        imports: [dynamicModule],
        resolvedCollisionsPerApp: [[AppService, forwardRef(() => dynamicModule)]],
        resolvedCollisionsPerMod: [[ModService, forwardRef(() => dynamicModule)]],
        resolvedCollisionsPerRou: [[RouService, forwardRef(() => dynamicModule)]],
        resolvedCollisionsPerReq: [[ReqService, forwardRef(() => dynamicModule)]],
      })
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta.resolvedCollisionsPerApp).toEqual([[AppService, dynamicModule]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerMod).toEqual([[ModService, dynamicModule]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerRou).toEqual([[RouService, dynamicModule]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerReq).toEqual([[ReqService, dynamicModule]]);
    });
  });

  describe('provider exports', () => {
    it('exports declared provider tokens separately for Mod, Rou, and Req levels', () => {
      class ModService {}
      class RouService {}
      class ReqService {}

      @featureModule({
        providersPerMod: [ModService],
        providersPerRou: [RouService],
        providersPerReq: [ReqService],
        exports: [ModService, RouService, ReqService],
      })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.exportedProvidersPerMod).toEqual([ModService]);
      expect(normalizedModuleMeta.exportedProvidersPerRou).toEqual([RouService]);
      expect(normalizedModuleMeta.exportedProvidersPerReq).toEqual([ReqService]);
    });

    it('exports multi providers separately for Mod, Rou, and Req levels', () => {
      class ModMultiService {}
      class RouMultiService {}
      class ReqMultiService {}

      const modMultiProvider: MultiProvider = { token: ModMultiService, useValue: 'mod', multi: true };
      const rouMultiProvider: MultiProvider = { token: RouMultiService, useValue: 'rou', multi: true };
      const reqMultiProvider: MultiProvider = { token: ReqMultiService, useValue: 'req', multi: true };

      @featureModule({
        providersPerMod: [modMultiProvider],
        providersPerRou: [rouMultiProvider],
        providersPerReq: [reqMultiProvider],
        exports: [ModMultiService, RouMultiService, ReqMultiService],
      })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.exportedMultiProvidersPerMod).toEqual([modMultiProvider]);
      expect(normalizedModuleMeta.exportedMultiProvidersPerRou).toEqual([rouMultiProvider]);
      expect(normalizedModuleMeta.exportedMultiProvidersPerReq).toEqual([reqMultiProvider]);
      expect(normalizedModuleMeta.exportedProvidersPerMod).toEqual([]);
      expect(normalizedModuleMeta.exportedProvidersPerRou).toEqual([]);
      expect(normalizedModuleMeta.exportedProvidersPerReq).toEqual([]);
    });

    it('throws ForbiddenAppExport when a module exports a providersPerApp token', () => {
      class AppService {}

      @featureModule({ providersPerApp: [AppService], exports: [AppService] })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new ForbiddenAppExport('Module1', 'AppService'));
    });

    it('throws ForbiddenNormalizedExport when exports contains a normalized provider object', () => {
      class Service1 {}

      @featureModule({ providersPerMod: [Service1], exports: [{ token: Service1, useClass: Service1 }] })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new ForbiddenNormalizedExport('Module1', 'Service1'));
    });

    it('throws UnknownExport when exports contains an undeclared provider token', () => {
      class Service1 {}
      class Service2 {}

      @featureModule({ providersPerMod: [Service1], exports: [Service2] })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new UnknownExport('Module1', 'Service2'));
    });
  });

  describe('module imports and re-exports', () => {
    it('re-exports an imported module class when the exported module has module metadata', () => {
      class Service1 {}

      @featureModule({ providersPerMod: [Service1], exports: [Service1] })
      class ImportedModule {}

      @featureModule({
        imports: [ImportedModule],
        providersPerMod: [{ token: 'local-token', useValue: 1 }],
        exports: ['local-token', ImportedModule],
      })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.importedStaticModules).toEqual([ImportedModule]);
      expect(normalizedModuleMeta.exportedStaticModules).toEqual([ImportedModule]);
    });

    it('throws UnknownExport when re-export target has no module decorator metadata', () => {
      class UndecoratedModule {}

      @featureModule({
        imports: [UndecoratedModule],
        providersPerMod: [{ token: 'local-token', useValue: 1 }],
        exports: ['local-token', UndecoratedModule],
      })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new UnknownExport('Module1', 'UndecoratedModule'));
    });

    it('throws ReexportFailure when a decorated module class is exported without being imported', () => {
      class Service1 {}

      @featureModule({ providersPerMod: [Service1], exports: [Service1] })
      class ImportedModule {}

      @featureModule({
        providersPerMod: [{ token: 'local-token', useValue: 1 }],
        exports: ['local-token', ImportedModule],
      })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new ReexportFailure('Module1', 'ImportedModule'));
    });

    it('does not throw ReexportFailure when a root module exports a module without importing it', () => {
      @featureModule()
      class ExportedModule {}

      @rootModule({
        exports: [ExportedModule],
      })
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta.exportedStaticModules).toEqual([ExportedModule]);
    });

    it('throws ReexportFailure when importing a DynamicModule but exporting only its module class', () => {
      class Service1 {}

      @featureModule({ providersPerMod: [Service1], exports: [Service1] })
      class ImportedModule {}

      const dynamicModule: DynamicModule = { module: ImportedModule, providersPerMod: [] };

      @featureModule({
        imports: [dynamicModule],
        providersPerMod: [{ token: 'local-token', useValue: 1 }],
        exports: ['local-token', ImportedModule],
      })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new ReexportFailure('Module1', 'ImportedModule'));
    });

    it('re-exports the same DynamicModule object that was imported through module params', () => {
      class Service1 {}
      class Service2 {}

      @featureModule({ providersPerMod: [Service1] })
      class ImportedModule {}

      const dynamicModule: DynamicModule = { module: ImportedModule, exports: [Service1] };

      @featureModule({ imports: [dynamicModule], providersPerMod: [Service2], exports: [Service2] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize({ module: Module1, exports: [dynamicModule] });
      expect(normalizedModuleMeta.importedDynamicModules).toEqual([dynamicModule]);
      expect(normalizedModuleMeta.exportedDynamicModules).toEqual([dynamicModule]);
      expect(normalizedModuleMeta.providersPerMod).toEqual([Service2]);
    });
  });

  describe('dynamic modules', () => {
    it('merges dynamic module id, providers, exports, and extensionsMeta into static module metadata', () => {
      class StaticAppService {}
      class DynamicAppService {}
      class StaticModService {}
      class DynamicModService {}
      class StaticRouService {}
      class DynamicRouService {}
      class StaticReqService {}
      class DynamicReqService {}

      @featureModule({
        providersPerApp: new ProviderBuilder().passThrough(StaticAppService),
        providersPerMod: [StaticModService],
        providersPerRou: [StaticRouService],
        providersPerReq: [StaticReqService],
        exports: [StaticModService, StaticRouService, StaticReqService],
        extensionsMeta: { staticOnly: true, shared: 'static' },
      })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize({
        id: 'dynamic-id',
        module: Module1,
        providersPerApp: [DynamicAppService],
        providersPerMod: [DynamicModService],
        providersPerRou: [DynamicRouService],
        providersPerReq: [DynamicReqService],
        extensionsMeta: { dynamicOnly: true, shared: 'dynamic' },
        exports: [DynamicModService, DynamicRouService, DynamicReqService],
      });

      expect(normalizedModuleMeta.id).toBe('dynamic-id');
      expect(normalizedModuleMeta.providersPerApp).toEqual([StaticAppService, DynamicAppService]);
      expect(normalizedModuleMeta.providersPerMod).toEqual([StaticModService, DynamicModService]);
      expect(normalizedModuleMeta.providersPerRou).toEqual([StaticRouService, DynamicRouService]);
      expect(normalizedModuleMeta.providersPerReq).toEqual([StaticReqService, DynamicReqService]);
      expect(normalizedModuleMeta.exportedProvidersPerMod).toEqual([StaticModService, DynamicModService]);
      expect(normalizedModuleMeta.exportedProvidersPerRou).toEqual([StaticRouService, DynamicRouService]);
      expect(normalizedModuleMeta.exportedProvidersPerReq).toEqual([StaticReqService, DynamicReqService]);
      expect(normalizedModuleMeta.extensionsMeta).toEqual({
        staticOnly: true,
        dynamicOnly: true,
        shared: 'dynamic',
      });
    });

    it('resolves forwardRef in the dynamic module class, dynamic providers, and dynamic exports', () => {
      class StaticService {}
      class DynamicService {}
      class DynamicClassProviderService {}

      @featureModule({
        providersPerMod: [StaticService],
        exports: [StaticService],
      })
      class Module1 {}

      const dynamicModule: DynamicModule = {
        module: forwardRef(() => Module1),
        providersPerMod: [
          forwardRef(() => DynamicService),
          {
            token: forwardRef(() => DynamicClassProviderService),
            useClass: forwardRef(() => DynamicClassProviderService),
          },
        ],
        exports: [forwardRef(() => DynamicService), forwardRef(() => DynamicClassProviderService)],
      };

      const normalizedModuleMeta = normalizer.normalize(dynamicModule);
      expect(normalizedModuleMeta.name).toBe('Module1-DynamicModule');
      expect(normalizedModuleMeta.providersPerMod).toEqual([
        StaticService,
        DynamicService,
        { token: DynamicClassProviderService, useClass: DynamicClassProviderService },
      ]);
      expect(normalizedModuleMeta.exportedProvidersPerMod).toEqual([
        StaticService,
        DynamicService,
        { token: DynamicClassProviderService, useClass: DynamicClassProviderService },
      ]);
    });
  });

  describe('forwardRef resolution', () => {
    it('resolves forwardRef in imports, exports, providers, multi providers, and resolved collisions', () => {
      class AppService {}
      class ModService {}
      class AppMultiService {}
      class ModMultiService {}

      @featureModule({ providersPerApp: [AppService] })
      class ImportedModule {}

      @featureModule({ providersPerApp: [AppService] })
      class DynamicImportedModule {}

      const dynamicModule: DynamicModule = { module: forwardRef(() => DynamicImportedModule) };

      @rootModule({
        imports: [forwardRef(() => ImportedModule), dynamicModule],
        providersPerApp: [
          forwardRef(() => AppService),
          { token: forwardRef(() => AppMultiService), useClass: forwardRef(() => AppMultiService), multi: true },
        ],
        providersPerMod: [
          forwardRef(() => ModService),
          { token: forwardRef(() => ModMultiService), useToken: forwardRef(() => ModMultiService), multi: true },
        ],
        resolvedCollisionsPerMod: [[forwardRef(() => ModService), forwardRef(() => ImportedModule)]],
        exports: [forwardRef(() => ModService), forwardRef(() => ModMultiService), forwardRef(() => ImportedModule), dynamicModule],
      })
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta.importedStaticModules).toEqual([ImportedModule]);
      expect(normalizedModuleMeta.importedDynamicModules).toEqual([{ module: DynamicImportedModule }]);
      expect(normalizedModuleMeta.exportedStaticModules).toEqual([ImportedModule]);
      expect(normalizedModuleMeta.exportedDynamicModules).toEqual([{ module: DynamicImportedModule }]);
      expect(normalizedModuleMeta.providersPerApp).toEqual([
        AppService,
        { token: AppMultiService, useClass: AppMultiService, multi: true },
      ]);
      expect(normalizedModuleMeta.providersPerMod).toEqual([
        ModService,
        { token: ModMultiService, useToken: ModMultiService, multi: true },
      ]);
      expect(normalizedModuleMeta.exportedProvidersPerMod).toEqual([ModService]);
      expect(normalizedModuleMeta.exportedMultiProvidersPerMod).toEqual([
        { token: ModMultiService, useToken: ModMultiService, multi: true },
      ]);
      expect(normalizedModuleMeta.resolvedCollisionsPerMod).toEqual([[ModService, ImportedModule]]);
    });

    it('resolves forwardRef for dynamic modules in imports and exports', () => {
      @featureModule()
      class DynamicImportedModule {}

      const dynamicModule: DynamicModule = { module: DynamicImportedModule, id: 'some-id' };

      @rootModule({
        imports: [forwardRef(() => dynamicModule)],
        exports: [forwardRef(() => dynamicModule)],
      })
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta.importedDynamicModules).toEqual([dynamicModule]);
      expect(normalizedModuleMeta.exportedDynamicModules).toEqual([dynamicModule]);
    });
  });

  describe('extensions', () => {
    it('normalizes and exports an extension class that implements a stage method', () => {
      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }

      @featureModule({ extensions: [{ extension: Extension1, export: true }] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.extensionProviders).toEqual([Extension1]);
      expect(normalizedModuleMeta.exportedExtensionProviders).toEqual([Extension1]);
    });

    it('accepts extensions that implement only stage2 or only stage3', () => {
      @injectable()
      class Stage2Extension implements Extension {
        async stage2() {}
      }

      @injectable()
      class Stage3Extension implements Extension {
        async stage3() {}
      }

      @featureModule({ extensions: [Stage2Extension, Stage3Extension] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.extensionProviders).toEqual([Stage2Extension, Stage3Extension]);
    });

    it('throws InvalidExtension when an extension provider has no stage method', () => {
      @injectable()
      class Extension1 {}

      @featureModule({ extensions: [{ extension: Extension1, export: true }] })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new InvalidExtension('Module1', 'Extension1'));
    });

    it('normalizes extension group providers and records the group token mapping', () => {
      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }

      @injectable()
      class Extension2 implements Extension {
        async stage1() {}
      }

      @featureModule({ extensions: [{ extension: Extension1, groups: [Extension2] }] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      const groupToken = KeyRegistry.getExtensionGroupToken(Extension2);
      expect(normalizedModuleMeta.extensionProviders).toEqual([
        { token: groupToken, useToken: Extension2, multi: true },
        Extension1,
        { token: groupToken, useToken: Extension1, multi: true },
      ]);
      expect(normalizedModuleMeta.extensionGroupTokensMap.get(Extension2)).toBe(groupToken);
    });

    it('puts exportOnly extensions only into exported extension metadata', () => {
      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }

      @featureModule({ extensions: [{ extension: Extension1, exportOnly: true }] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.extensionProviders).toEqual([]);
      expect(normalizedModuleMeta.exportedExtensionProviders).toEqual([Extension1]);
      expect(normalizedModuleMeta.exportedExtensionConfigs).toHaveLength(1);
    });
  });

  describe('aspect decorators', () => {
    interface SomeAspectDynamicOptions extends DynamicModuleOptions {
      path?: string;
      num?: number;
    }

    interface SomeAspectOptions extends StaticAspectOptions<SomeAspectDynamicOptions> {
      one?: number;
      two?: number;
      flag?: boolean;
      appends?: ({ module: ModRefId } & AnyObj)[];
    }

    class SomeAspectMeta extends BaseNormalizedModuleMeta {
      normalizedModuleMeta?: NormalizedModuleMeta;
      aspectOptions?: SomeAspectOptions;
      flag?: boolean;
      path?: string;
      targetModRefId?: ModRefId;
    }

    class SomeModuleAspect extends ModuleAspectHandler<SomeAspectOptions> {
      override normalize(normalizedModuleMeta: NormalizedModuleMeta) {
        const meta = createAspectMetaProxy(normalizedModuleMeta, SomeAspectMeta);
        meta.normalizedModuleMeta = normalizedModuleMeta;
        meta.aspectOptions = this.moduleOptions;

        if (isDynamicModule(normalizedModuleMeta.modRefId)) {
          const params = normalizedModuleMeta.modRefId.aspectOptions?.get(aspectSome);
          meta.path = params?.path;
          meta.targetModRefId = normalizedModuleMeta.modRefId;
        } else {
          meta.flag = this.moduleOptions.flag;
          meta.targetModRefId = normalizedModuleMeta.modRefId;
        }

        return meta;
      }
    }

    function getModuleAspect(data?: SomeAspectOptions): ModuleAspectHandler<SomeAspectOptions> {
      return new SomeModuleAspect(Object.assign({}, data));
    }

    const aspectSome: ModuleAspectDecorator<SomeAspectOptions, SomeAspectDynamicOptions, SomeAspectMeta> = Reflector.makeClassDecorator(
      getModuleAspect,
      'aspectSome',
    );

    it('stores metadata returned by ModuleAspectHandler.normalize() in normalizedModuleMeta.normalizedAspectMetaMap', () => {
      const moduleOptions: SomeAspectOptions = { one: 1, two: 2, flag: true };

      @aspectSome(moduleOptions)
      @featureModule()
      class Module1 {}

      const aspectMeta = normalizer.normalize(Module1).normalizedAspectMetaMap.get(aspectSome);
      expect(aspectMeta?.normalizedModuleMeta?.modRefId).toBe(Module1);
      expect(aspectMeta?.aspectOptions).toEqual(moduleOptions);
      expect(aspectMeta?.targetModRefId).toBe(Module1);
      expect(aspectMeta?.flag).toBe(true);
    });

    it('normalizes providers, exports, extensions, and extensionsMeta declared by an aspect decorator', () => {
      class Service1 {}

      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }

      @aspectSome({
        providersPerMod: [Service1],
        exports: [Service1],
        extensions: [{ extension: Extension1, export: true }],
        extensionsMeta: { one: 1 },
      })
      @featureModule()
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.providersPerMod).toEqual([Service1]);
      expect(normalizedModuleMeta.exportedProvidersPerMod).toEqual([Service1]);
      expect(normalizedModuleMeta.extensionProviders).toEqual([Extension1]);
      expect(normalizedModuleMeta.exportedExtensionProviders).toEqual([Extension1]);
      expect(normalizedModuleMeta.extensionsMeta).toEqual({ one: 1 });
    });

    it('merges wrapper init params, dynamic module params, and existing aspectOptions when importing modules with params', () => {
      class Service1 {}
      class Service2 {}
      class Service3 {}

      @featureModule()
      class Module1 {}

      @featureModule()
      class Module2 {}

      const dynamicModule1: DynamicModuleWithAspectOptions & SomeAspectDynamicOptions = {
        module: Module1,
        providersPerMod: [Service1],
        providersPerApp: [Service3],
        extensionsMeta: { one: 1 },
        num: 4,
        aspectOptions: new Map(),
      };
      dynamicModule1.aspectOptions.set(aspectSome, { path: 'path-1' });

      const dynamicModule2: DynamicModuleWithAspectOptions & SomeAspectDynamicOptions = {
        module: Module2,
        providersPerApp: [Service2],
        num: 12,
        extensionsMeta: { four: 4 },
        aspectOptions: new Map(),
      };
      dynamicModule2.aspectOptions.set(aspectSome, {
        path: 'path-2',
        providersPerApp: [Service1],
        num: 11,
        extensionsMeta: { three: 3 },
      });

      @aspectSome({
        imports: [{ dynamicModule: dynamicModule1, providersPerMod: [Service2], extensionsMeta: { two: 2 }, num: 5 }, dynamicModule2],
      })
      @rootModule()
      class AppModule {}

      normalizer.normalize(AppModule);
      expect(dynamicModule1.aspectOptions.get(aspectSome)).toEqual<SomeAspectDynamicOptions>({
        path: 'path-1',
        providersPerMod: [Service1, Service2],
        extensionsMeta: { one: 1, two: 2 },
        num: 5,
        providersPerApp: [Service3],
      });
      expect(dynamicModule2.aspectOptions.get(aspectSome)).toEqual<SomeAspectDynamicOptions>({
        providersPerApp: [Service1, Service2],
        num: 12,
        extensionsMeta: { three: 3, four: 4 },
        path: 'path-2',
      });
    });

    it('normalizes aspect decorator imports and exports for module classes, DynamicModule objects, and wrappers', () => {
      class Service1 {}

      @featureModule({ providersPerApp: [Service1] })
      class Module1 {}

      @featureModule({ providersPerApp: [Service1] })
      class Module2 {}
      const dynamicModule2: DynamicModule = { module: Module2 };

      @featureModule({ providersPerApp: [Service1] })
      class Module3 {}

      @featureModule({ providersPerApp: [Service1] })
      class Module4 {}
      const dynamicModule4: DynamicModule = { module: Module4 };

      @aspectSome({
        imports: [Module1, dynamicModule2, { module: Module3 }, { dynamicModule: dynamicModule4 }],
        exports: [Module1, dynamicModule2, dynamicModule4],
      })
      @rootModule()
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta.importedStaticModules).toEqual([Module1]);
      expect(normalizedModuleMeta.exportedStaticModules).toEqual([Module1]);
      expect(normalizedModuleMeta.importedDynamicModules).toEqual<DynamicModule[]>([
        dynamicModule2,
        { module: Module3, aspectOptions: expect.any(Map) },
        dynamicModule4,
      ]);
      expect(normalizedModuleMeta.exportedDynamicModules).toEqual([dynamicModule2, dynamicModule4]);
    });

    it('resolves forwardRef in aspect decorator imports and exports', () => {
      class Service1 {}

      @featureModule({ providersPerApp: [Service1] })
      class Module1 {}

      @featureModule({ providersPerApp: [Service1] })
      class Module2 {}
      const dynamicModule2: DynamicModule = { module: forwardRef(() => Module2) };

      @featureModule({ providersPerApp: [Service1] })
      class Module3 {}

      @featureModule({ providersPerApp: [Service1] })
      class Module4 {}
      const dynamicModule4: DynamicModule = { module: forwardRef(() => Module4) };

      @aspectSome({
        imports: [forwardRef(() => Module1), dynamicModule2, { module: forwardRef(() => Module3) }, { dynamicModule: dynamicModule4 }],
        exports: [forwardRef(() => Module1), dynamicModule2, dynamicModule4],
      })
      @rootModule()
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta.importedStaticModules).toEqual([Module1]);
      expect(normalizedModuleMeta.importedDynamicModules).toEqual<DynamicModule[]>([
        dynamicModule2,
        { module: Module3, aspectOptions: expect.any(Map) },
        dynamicModule4,
      ]);
      expect(normalizedModuleMeta.exportedStaticModules).toEqual([Module1]);
      expect(normalizedModuleMeta.exportedDynamicModules).toEqual([dynamicModule2, dynamicModule4]);
      expect(dynamicModule2.module).toBe(Module2);
      expect(dynamicModule4.module).toBe(Module4);
    });

    it('applies hostAspectOptions via applyHostAspectOptions method', () => {
      @featureModule()
      class HostModule {}

      class HostModuleAspect extends ModuleAspectHandler<SomeAspectOptions> {
        override hostModule = HostModule;
        override hostAspectOptions = { flag: true };

        override normalize(normalizedModuleMeta: NormalizedModuleMeta): SomeAspectMeta {
          return {
            flag: this.moduleOptions.flag,
            targetModRefId: normalizedModuleMeta.modRefId,
          } as SomeAspectMeta;
        }
      }

      const hostInitSome: ModuleAspectDecorator<SomeAspectOptions, {}, {}> = Reflector.makeClassDecorator((data) => new HostModuleAspect(data));
      const moduleAspect = new HostModuleAspect({}).clone({ flag: true });

      const normalizedModuleMeta = normalizer.normalize(HostModule);
      normalizer.applyHostAspectOptions(normalizedModuleMeta, hostInitSome, moduleAspect as any);

      expect(normalizedModuleMeta.normalizedAspectMetaMap.get(hostInitSome)).toEqual({ flag: true, targetModRefId: HostModule });
    });

    it('imports the host module when an aspect decorator declares hostModule on a different module', () => {
      @featureModule()
      class HostModule {}

      class HostModuleAspect extends ModuleAspectHandler<SomeAspectOptions> {
        override hostModule = HostModule;
      }

      const hostInitSome: ModuleAspectDecorator<SomeAspectOptions, {}, {}> = Reflector.makeClassDecorator((data) => new HostModuleAspect(data));

      class Service1 {}

      @hostInitSome({})
      @featureModule({ providersPerMod: [Service1], exports: [Service1] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.importedStaticModules).toContain(HostModule);
    });


  });

  describe('validation errors', () => {
    it('throws InvalidModRefId when the normalized value is neither a module class nor a DynamicModule', () => {
      expect(() => normalizer.normalize({} as ModRefId)).toThrow(new InvalidModRefId());
    });

    it('throws MissingModuleDecorator when the target class has no module decorator metadata', () => {
      class UndecoratedModule {}

      expect(() => normalizer.normalize(UndecoratedModule)).toThrow(new MissingModuleDecorator('UndecoratedModule'));
    });

    it('throws UndefinedSymbol with Imports context and array index when imports contains undefined', () => {
      @featureModule({
        imports: [undefined as any],
        providersPerMod: [{ token: 'local-token', useValue: 1 }],
        exports: ['local-token'],
      })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new UndefinedSymbol('Imports', 'Module1', 0));
    });

    it('throws UndefinedSymbol with Exports context and array index when static exports contains undefined', () => {
      class Service1 {}

      @featureModule({ providersPerMod: [Service1], exports: [undefined as any] })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new UndefinedSymbol('Static exports', 'Module1', 0));
    });

    it('throws UndefinedSymbol with Exports with params context when dynamic module exports contains undefined', () => {
      class Service1 {}

      @featureModule({ providersPerMod: [Service1], exports: [Service1] })
      class Module1 {}

      expect(() => normalizer.normalize({ module: Module1, exports: [undefined as any] })).toThrow(
        new UndefinedSymbol('Dynamic exports', 'Module1-DynamicModule', 0),
      );
    });

    it('throws ResolvedCollisionTokensOnly when resolvedCollisionsPerMod uses a normalized provider instead of a token', () => {
      class Service1 {}

      @featureModule()
      class ImportedModule {}

      @featureModule({
        providersPerMod: [Service1],
        resolvedCollisionsPerMod: [[{ token: Service1, useClass: Service1 }, ImportedModule]],
        exports: [Service1],
      })
      class Module1 {}

      expect(() => normalizer.normalize(Module1)).toThrow(new ResolvedCollisionTokensOnly('Module1', 'Service1'));
    });

    it('throws EmptyModuleMeta for a feature module that contributes no metadata', () => {
      @featureModule()
      class EmptyModule {}

      const normalizedModuleMeta = normalizer.normalize(EmptyModule);
      expect(() => normalizer.checkEmptyMeta(normalizedModuleMeta)).toThrow(new EmptyModuleMeta());
    });

    it('does not throw EmptyModuleMeta for a root module even with no other metadata', () => {
      @rootModule()
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(() => normalizer.checkEmptyMeta(normalizedModuleMeta)).not.toThrow();
    });
  });

  describe('external module detection', () => {
    class ExternalModuleNormalizer extends ModuleNormalizer {
      customMeta = new Map<StaticModule, DecoratorMeta[]>();

      override normalize(modRefId: any): NormalizedModuleMeta {
        return super.normalize(modRefId, { externalModuleDetectionFailed: () => {} } as any);
      }

      protected override getDecoratorMeta(modRefId: any) {
        return this.customMeta.get(modRefId);
      }
    }

    it('marks modules outside rootDeclaredInDir as external and modules inside rootDeclaredInDir as internal', () => {
      const externalModuleNormalizer = new ExternalModuleNormalizer();
      class AppModule {}
      class ExternalModule {}
      class InternalModule {}

      const dummyDecorator = () => {};
      const rootDec = new DecoratorMeta(dummyDecorator, new RootModuleOptions(), undefined, '/user-project/src');
      externalModuleNormalizer.customMeta.set(AppModule, [rootDec]);

      const externalModuleOptions = Object.assign(new FeatureModuleOptions(), {
        providersPerApp: [{ token: 'external-token', useValue: 1 }],
      });
      const externalDec = new DecoratorMeta(dummyDecorator, externalModuleOptions, undefined, '/node_modules/external-mod');
      externalModuleNormalizer.customMeta.set(ExternalModule, [externalDec]);

      const internalModuleOptions = Object.assign(new FeatureModuleOptions(), {
        providersPerApp: [{ token: 'internal-token', useValue: 1 }],
      });
      const internalDec = new DecoratorMeta(
        dummyDecorator,
        internalModuleOptions,
        undefined,
        '/user-project/src/features/internal-mod',
      );
      externalModuleNormalizer.customMeta.set(InternalModule, [internalDec]);

      expect(externalModuleNormalizer.normalize(AppModule).isExternal).toBe(false);
      expect(externalModuleNormalizer.normalize(ExternalModule).isExternal).toBe(true);
      expect(externalModuleNormalizer.normalize(InternalModule).isExternal).toBe(false);
    });

    it('marks Holu package modules as external when the root module is not declared inside holu/packages', () => {
      const externalModuleNormalizer = new ExternalModuleNormalizer();
      class AppModule {}
      class HoluModule {}

      const dummyDecorator = () => {};
      const rootDec = new DecoratorMeta(dummyDecorator, new RootModuleOptions(), undefined, '/user-project/src');
      externalModuleNormalizer.customMeta.set(AppModule, [rootDec]);

      const holuModuleOptions = Object.assign(new FeatureModuleOptions(), {
        providersPerApp: [{ token: 'holu-token', useValue: 1 }],
      });
      const holuDec = new DecoratorMeta(
        dummyDecorator,
        holuModuleOptions,
        undefined,
        '/user-project/node_modules/holu/packages/core',
      );
      externalModuleNormalizer.customMeta.set(HoluModule, [holuDec]);

      externalModuleNormalizer.normalize(AppModule);
      expect(externalModuleNormalizer.normalize(HoluModule).isExternal).toBe(true);
    });

    it('sets inheritsAspects from moduleOptions when explicitly specified', () => {
      @featureModule({ inheritsAspects: false, providersPerApp: [{ token: 'tok', useValue: 1 }] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.inheritsAspects).toBe(false);
    });
  });
});
