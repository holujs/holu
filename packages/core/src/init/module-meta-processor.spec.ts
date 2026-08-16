import { featureModule } from '#decorators/feature-module.js';
import { StaticAspectOptions, ModuleAspectHandler, ModuleAspectDecorator } from '#decorators/module-aspects.js';
import { BaseNormalizedModuleMeta, createAspectMetaProxy, NormalizedModuleMeta } from '#init/normalized-meta.js';
import { rootModule } from '#decorators/root-module.js';
import { Reflector } from '#di/reflector.js';
import { Extension } from '#extension/extension-types.js';
import { AnyObj } from '#types/mix.js';
import { ModRefId } from '#decorators/module-decorator-options.js';
import { DynamicModuleOptions, DynamicModuleWithAspectOptions, DynamicModule } from '#decorators/module-decorator-options.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { ModuleNormalizer } from './module-normalizer.js';
import { ModuleMetaProcessor } from './module-meta-processor.js';
import {
  UnknownExport,
  ForbiddenNormalizedExport,
  ForbiddenAppExport,
  InvalidExtension,
  ReexportFailure,
  UndefinedSymbol,
} from '#error/core-errors.js';
import { injectable } from '#di/decorators.js';
import type { MultiProvider } from '#di/utils.js';
import { forwardRef } from '#di/forward-ref.js';
import { KeyRegistry } from '#di/key-registry.js';
import { isDynamicModule } from '#decorators/type-guards.js';

describe('ModuleMetaProcessor', () => {
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

    it('re-exports the same DynamicModule object that was imported as a dynamic module', () => {
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
      staticAspectOptions?: SomeAspectOptions;
      flag?: boolean;
      path?: string;
      targetModRefId?: ModRefId;
    }

    class SomeModuleAspect extends ModuleAspectHandler<SomeAspectOptions> {
      override normalize(normalizedModuleMeta: NormalizedModuleMeta) {
        const meta = createAspectMetaProxy(normalizedModuleMeta, SomeAspectMeta);
        meta.normalizedModuleMeta = normalizedModuleMeta;
        meta.staticAspectOptions = this.staticAspectOptions;

        if (isDynamicModule(normalizedModuleMeta.modRefId)) {
          const dynamicOptions = normalizedModuleMeta.modRefId.dynamicAspectOptionsMap?.get(someAspect);
          meta.path = dynamicOptions?.path;
          meta.targetModRefId = normalizedModuleMeta.modRefId;
        } else {
          meta.flag = this.staticAspectOptions.flag;
          meta.targetModRefId = normalizedModuleMeta.modRefId;
        }

        return meta;
      }
    }

    function getModuleAspect(data?: SomeAspectOptions): ModuleAspectHandler<SomeAspectOptions> {
      return new SomeModuleAspect(Object.assign({}, data));
    }

    const someAspect: ModuleAspectDecorator<SomeAspectOptions, SomeAspectDynamicOptions, SomeAspectMeta> =
      Reflector.makeClassDecorator(getModuleAspect, 'someAspect');

    it('stores metadata returned by ModuleAspectHandler.normalize() in normalizedModuleMeta.normalizedAspectMetaMap', () => {
      const staticAspectOptions: SomeAspectOptions = { one: 1, two: 2, flag: true };

      @someAspect(staticAspectOptions)
      @featureModule()
      class Module1 {}

      const aspectMeta = normalizer.normalize(Module1).normalizedAspectMetaMap.get(someAspect);
      expect(aspectMeta?.normalizedModuleMeta?.modRefId).toBe(Module1);
      expect(aspectMeta?.staticAspectOptions).toEqual(staticAspectOptions);
      expect(aspectMeta?.targetModRefId).toBe(Module1);
      expect(aspectMeta?.flag).toBe(true);
    });

    it('normalizes providers, exports, extensions, and extensionsMeta declared by an aspect decorator', () => {
      class Service1 {}

      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }

      @someAspect({
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

    it('merges wrapper aspect options, dynamic module options, and existing dynamicAspectOptionsMap when importing modules with dynamic options', () => {
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
        dynamicAspectOptionsMap: new Map(),
      };
      dynamicModule1.dynamicAspectOptionsMap.set(someAspect, { path: 'path-1' });

      const dynamicModule2: DynamicModuleWithAspectOptions & SomeAspectDynamicOptions = {
        module: Module2,
        providersPerApp: [Service2],
        num: 12,
        extensionsMeta: { four: 4 },
        dynamicAspectOptionsMap: new Map(),
      };
      dynamicModule2.dynamicAspectOptionsMap.set(someAspect, {
        path: 'path-2',
        providersPerApp: [Service1],
        num: 11,
        extensionsMeta: { three: 3 },
      });

      @someAspect({
        imports: [{ dynamicModule: dynamicModule1, providersPerMod: [Service2], extensionsMeta: { two: 2 }, num: 5 }, dynamicModule2],
      })
      @rootModule()
      class AppModule {}

      normalizer.normalize(AppModule);
      expect(dynamicModule1.dynamicAspectOptionsMap.get(someAspect)).toEqual<SomeAspectDynamicOptions>({
        path: 'path-1',
        providersPerMod: [Service1, Service2],
        extensionsMeta: { one: 1, two: 2 },
        num: 5,
        providersPerApp: [Service3],
      });
      expect(dynamicModule2.dynamicAspectOptionsMap.get(someAspect)).toEqual<SomeAspectDynamicOptions>({
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

      @someAspect({
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
        { module: Module3, dynamicAspectOptionsMap: expect.any(Map) },
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

      @someAspect({
        imports: [forwardRef(() => Module1), dynamicModule2, { module: forwardRef(() => Module3) }, { dynamicModule: dynamicModule4 }],
        exports: [forwardRef(() => Module1), dynamicModule2, dynamicModule4],
      })
      @rootModule()
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(normalizedModuleMeta.importedStaticModules).toEqual([Module1]);
      expect(normalizedModuleMeta.importedDynamicModules).toEqual<DynamicModule[]>([
        dynamicModule2,
        { module: Module3, dynamicAspectOptionsMap: expect.any(Map) },
        dynamicModule4,
      ]);
      expect(normalizedModuleMeta.exportedStaticModules).toEqual([Module1]);
      expect(normalizedModuleMeta.exportedDynamicModules).toEqual([dynamicModule2, dynamicModule4]);
      expect(dynamicModule2.module).toBe(Module2);
      expect(dynamicModule4.module).toBe(Module4);
    });

    it('imports the host module when an aspect decorator declares hostModule on a different module', () => {
      @featureModule()
      class HostModule {}

      class HostModuleAspect extends ModuleAspectHandler<SomeAspectOptions> {
        override hostModule = HostModule;
      }

      const hostSomeAspect: ModuleAspectDecorator<SomeAspectOptions, {}, {}> = Reflector.makeClassDecorator(
        (data) => new HostModuleAspect(data),
      );

      class Service1 {}

      @hostSomeAspect({})
      @featureModule({ providersPerMod: [Service1], exports: [Service1] })
      class Module1 {}

      const normalizedModuleMeta = normalizer.normalize(Module1);
      expect(normalizedModuleMeta.importedStaticModules).toContain(HostModule);
    });

    it('applies hostStaticAspectOptions via applyHostStaticAspectOptions method', () => {
      @featureModule()
      class HostModule {}

      class HostModuleAspect extends ModuleAspectHandler<SomeAspectOptions> {
        override hostModule = HostModule;
        override hostStaticAspectOptions = { flag: true };

        override normalize(normalizedModuleMeta: NormalizedModuleMeta): SomeAspectMeta {
          return {
            flag: this.staticAspectOptions.flag,
            targetModRefId: normalizedModuleMeta.modRefId,
          } as SomeAspectMeta;
        }
      }

      const hostSomeAspect: ModuleAspectDecorator<SomeAspectOptions, {}, {}> = Reflector.makeClassDecorator(
        (data) => new HostModuleAspect(data),
      );
      const moduleAspect = new HostModuleAspect({}).clone({ flag: true });

      const normalizedModuleMeta = normalizer.normalize(HostModule);
      const metaProcessor = new ModuleMetaProcessor();
      metaProcessor.applyHostStaticAspectOptions(normalizedModuleMeta, hostSomeAspect, moduleAspect as any);

      expect(normalizedModuleMeta.normalizedAspectMetaMap.get(hostSomeAspect)).toEqual({ flag: true, targetModRefId: HostModule });
    });

    it('registerAspectOnModule registers aspect and ensures host module is imported', () => {
      @featureModule()
      class HostModule {}
      class HostModuleAspect extends ModuleAspectHandler<SomeAspectOptions> {
        override hostModule = HostModule;
        override normalize(normalizedModuleMeta: NormalizedModuleMeta): SomeAspectMeta {
          return {
            targetModRefId: normalizedModuleMeta.modRefId,
          } as SomeAspectMeta;
        }
      }
      const hostSomeAspect = Reflector.makeClassDecorator((data) => new HostModuleAspect(data));
      const moduleAspect = new HostModuleAspect({});

      @featureModule()
      class Module1 {}
      const normalizedModuleMeta = normalizer.normalize(Module1);
      const metaProcessor = new ModuleMetaProcessor();

      metaProcessor.registerAspectOnModule(normalizedModuleMeta, hostSomeAspect, moduleAspect);

      expect(normalizedModuleMeta.allModuleAspectsMap.get(hostSomeAspect)).toBe(moduleAspect);
      expect(normalizedModuleMeta.moduleAspectMap.get(hostSomeAspect)).toBe(moduleAspect);
      expect(normalizedModuleMeta.importedStaticModules).toContain(HostModule);
      expect(normalizedModuleMeta.normalizedAspectMetaMap.get(hostSomeAspect)).toEqual({ targetModRefId: Module1 });
    });

    it('throws errors for invalid exports in aspect decorators', () => {
      class UnknownService {}
      class AppService {}

      @someAspect({ exports: [undefined as any] })
      @featureModule()
      class ModuleWithUndefinedExport {}
      expect(() => normalizer.normalize(ModuleWithUndefinedExport)).toThrow(
        new UndefinedSymbol('Static exports', 'ModuleWithUndefinedExport', 0),
      );

      @someAspect({ exports: [{ token: 't', useValue: 'v' } as any] })
      @featureModule()
      class ModuleWithNormalizedExport {}
      expect(() => normalizer.normalize(ModuleWithNormalizedExport)).toThrow(
        new ForbiddenNormalizedExport('ModuleWithNormalizedExport', 't'),
      );

      @someAspect({ providersPerApp: [AppService], exports: [AppService] })
      @featureModule()
      class ModuleWithAppExport {}
      expect(() => normalizer.normalize(ModuleWithAppExport)).toThrow(new ForbiddenAppExport('ModuleWithAppExport', 'AppService'));

      @someAspect({ exports: [UnknownService] })
      @featureModule()
      class ModuleWithUnknownExport {}
      expect(() => normalizer.normalize(ModuleWithUnknownExport)).toThrow(
        new UnknownExport('ModuleWithUnknownExport', 'UnknownService'),
      );
    });

    it('resolves forwardRef for resolvedCollisions in aspect decorators', () => {
      class Token1 {}
      class Token2 {}
      class Module1 {}
      class Module2 {}

      @someAspect({
        resolvedCollisionsPerApp: [[forwardRef(() => Token1), { module: forwardRef(() => Module1) }]],
        resolvedCollisionsPerMod: [[forwardRef(() => Token2), forwardRef(() => Module2)]],
      } as any)
      @featureModule()
      class ModuleWithCollisions {}

      const normalizedModuleMeta = normalizer.normalize(ModuleWithCollisions);
      expect(normalizedModuleMeta.resolvedCollisionsPerApp).toEqual([[Token1, { module: Module1 }]]);
      expect(normalizedModuleMeta.resolvedCollisionsPerMod).toEqual([[Token2, Module2]]);
    });

    it('assertValidExtensionProvider handles useToken and useValue properly in extensions declared by an aspect decorator', () => {
      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }

      @someAspect({
        extensions: [
          { extension: { token: 'ext1', useToken: forwardRef(() => Extension1) } as any },
          { extension: { token: 'ext2', useValue: new Extension1() } as any },
        ],
      })
      @featureModule()
      class ModuleWithExtensions {}

      const normalizedModuleMeta = normalizer.normalize(ModuleWithExtensions);
      expect(normalizedModuleMeta.extensionProviders).toEqual([
        { token: 'ext1', useToken: Extension1 },
        { token: 'ext2', useValue: expect.any(Extension1) },
      ]);
    });

    it('resolves forwardRef for useToken in providers', () => {
      class Service1 {}

      @someAspect({
        providersPerMod: [{ token: 't1', useToken: forwardRef(() => Service1) }],
      })
      @featureModule()
      class ModuleWithUseToken {}

      const normalizedModuleMeta = normalizer.normalize(ModuleWithUseToken);
      expect(normalizedModuleMeta.providersPerMod).toEqual([{ token: 't1', useToken: Service1 }]);
    });

    it('normalizes aspect decorator dynamic wrapper exports via applyAspectExports', () => {
      @featureModule()
      class Module2 {}
      const dynamicModule2: DynamicModule = { module: Module2 };

      @featureModule()
      class ModuleWithDynamicWrapperExport {}

      const normalizedModuleMeta = normalizer.normalize(ModuleWithDynamicWrapperExport);
      const metaProcessor = new ModuleMetaProcessor();
      (metaProcessor as any).applyAspectExports({ exports: [{ dynamicModule: dynamicModule2 }] }, normalizedModuleMeta);

      expect(normalizedModuleMeta.exportedDynamicModules).toEqual([dynamicModule2]);
    });

    it('normalizes exportedGroupTokensMap in extensions declared by an aspect decorator', () => {
      @injectable()
      class Extension1 implements Extension {
        async stage1() {}
      }
      @injectable()
      class Extension2 implements Extension {
        async stage1() {}
      }

      @someAspect({
        extensions: [{ extension: Extension1, groups: [Extension2], export: true }],
      })
      @featureModule()
      class ModuleWithExtensions {}

      const normalizedModuleMeta = normalizer.normalize(ModuleWithExtensions);
      const groupToken = KeyRegistry.getExtensionGroupToken(Extension2);
      expect(normalizedModuleMeta.exportedExtensionGroupTokensMap.get(Extension2)).toBe(groupToken);
    });
  });
});
