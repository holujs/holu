import { DeepModulesImporter } from '#init/deep-modules-importer.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { Level } from '#types/mix.js';
import { ModRefId } from '#decorators/module-decorator-options.js';
import { Provider } from '#di/top/types-and-models.js';
import { ModuleRegistry } from '#init/module-registry.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { CyclicImports } from '#error/core-errors.js';
import { BaseImportRegistry } from './types.js';
import { injectable } from '#di/decorators.js';

describe('DeepModulesImporter', () => {
  @injectable()
  class DeepModulesImporterMock extends DeepModulesImporter {
    override dependencyChain: [ModRefId, Provider][] = [];
    override resolveImportedProviders(targetProviders: NormalizedModuleMeta, baseImportRegistry: BaseImportRegistry, levels: Level[]) {
      return super.resolveImportedProviders(targetProviders, baseImportRegistry, levels);
    }
    override addToUnfinishedSearchDependencies(module: ModRefId, provider: Provider) {
      return super.addToUnfinishedSearchDependencies(module, provider);
    }
    override deleteFromUnfinishedSearchDependencies(module: ModRefId, provider: Provider) {
      return super.deleteFromUnfinishedSearchDependencies(module, provider);
    }
  }

  let mock: DeepModulesImporterMock;
  let moduleRegistry: ModuleRegistry;
  let systemLogMediator: SystemLogMediator;

  beforeEach(() => {
    clearDebugClassNames();
    systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
    moduleRegistry = new ModuleRegistry(systemLogMediator);
    mock = new DeepModulesImporterMock({
      moduleRegistry,
      log: null as any,
      providersPerApp: null as any,
      shallowModuleImportsMap: null as any,
    });
  });

  describe('resolveImportedProviders', () => {
    describe('addToUnfinishedSearchDependencies(), deleteFromUnfinishedSearchDependencies() and throwCircularDependencies()', () => {
      class Module1 {}
      class Provider1 {}
      class Module2 {}
      class Provider2 {}
      class Module3 {}
      class Provider3 {}

      it('adding and removing dependencies', () => {
        expect(mock.dependencyChain).toEqual([]);
        mock.addToUnfinishedSearchDependencies(Module1, Provider1);
        mock.addToUnfinishedSearchDependencies(Module2, Provider2);
        mock.addToUnfinishedSearchDependencies(Module3, Provider3);
        expect(mock.dependencyChain).toEqual([
          [Module1, Provider1],
          [Module2, Provider2],
          [Module3, Provider3],
        ]);
        mock.deleteFromUnfinishedSearchDependencies(Module2, Provider2);
        expect(mock.dependencyChain).toEqual([
          [Module1, Provider1],
          [Module3, Provider3],
        ]);
      });

      it('throw properly message', () => {
        expect(mock.dependencyChain).toEqual([]);
        mock.addToUnfinishedSearchDependencies(Module1, Provider1);
        mock.addToUnfinishedSearchDependencies(Module2, Provider2);
        mock.addToUnfinishedSearchDependencies(Module3, Provider3);
        const err = new CyclicImports(
          '[Provider2 in Module2] -> [Provider3 in Module3] -> [Provider2 in Module2]',
          '[Provider1 in Module1]',
        );
        expect(() => mock.addToUnfinishedSearchDependencies(Module2, Provider2)).toThrow(err);
      });
    });
  });
});
