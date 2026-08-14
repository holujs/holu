import { featureModule } from '#decorators/feature-module.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { rootModule, RootModuleOptions } from '#decorators/root-module.js';
import { Extension } from '#extension/extension-types.js';
import { ModRefId, type StaticModule } from '#decorators/module-decorator-options.js';
import { FeatureModuleOptions, DynamicModule } from '#decorators/module-decorator-options.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { ModuleNormalizer } from './module-normalizer.js';
import { ModuleAspectApplier } from './module-aspect-applier.js';
import { ProviderBuilder } from '#utils/providers.js';
import {
  InvalidModRefId,
  MissingModuleDecorator,
  EmptyModuleMeta,
  ResolvedCollisionTokensOnly,
  UndefinedSymbol,
} from '#error/core-errors.js';
import { injectable } from '#di/decorators.js';
import type { MultiProvider } from '#di/utils.js';
import { forwardRef } from '#di/forward-ref.js';
import { DecoratorMeta } from '#di/top/decorator-and-value.js';

describe('ModuleNormalizer', () => {
  class MockModuleNormalizer extends ModuleNormalizer {
    override normalize(modRefId: ModRefId): NormalizedModuleMeta {
      return super.normalize(modRefId, { externalModuleDetectionFailed: () => {} } as any);
    }
  }

  let normalizer: MockModuleNormalizer;
  let applier: ModuleAspectApplier;

  beforeEach(() => {
    clearDebugClassNames();
    normalizer = new MockModuleNormalizer();
    applier = new ModuleAspectApplier();
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
      expect(() => applier.checkEmptyMeta(normalizedModuleMeta)).toThrow(new EmptyModuleMeta());
    });

    it('does not throw EmptyModuleMeta for a root module even with no other metadata', () => {
      @rootModule()
      class AppModule {}

      const normalizedModuleMeta = normalizer.normalize(AppModule);
      expect(() => applier.checkEmptyMeta(normalizedModuleMeta)).not.toThrow();
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
      const holuDec = new DecoratorMeta(dummyDecorator, holuModuleOptions, undefined, '/user-project/node_modules/holu/packages/core');
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
