import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { ModuleNormalizer } from './module-normalizer.js';
import { UnknownExport, ForbiddenNormalizedExport, ForbiddenAppExport, ReexportFailure } from '#error/core-errors.js';
import type { MultiProvider } from '#di/utils.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { DynamicModule } from '#decorators/module-decorator-options.js';

describe('ImportsExportsProcessor (via ModuleNormalizer)', () => {
  class MockModuleNormalizer extends ModuleNormalizer {
    override normalize(modRefId: ModRefId): NormalizedModuleMeta {
      return super.normalize(modRefId);
    }
  }

  let normalizer: MockModuleNormalizer;

  beforeEach(() => {
    clearDebugClassNames();
    const systemLogMediator = { externalModuleDetectionFailed: () => {} } as any;
    normalizer = new MockModuleNormalizer(systemLogMediator);
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
});
