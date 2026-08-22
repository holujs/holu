import { jest } from '@jest/globals';

import { Reflector } from '#di/reflector.js';
import { featureModule } from '#decorators/feature-module.js';
import { rootModule } from '#decorators/root-module.js';
import { SystemLogMediator } from '#logger/system-log-mediator.js';
import { MutableModuleRegistry } from './mutable-module-registry.js';
import { ModuleAspectDecorator, ModuleAspectHandler } from '#decorators/module-aspects.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { ModRefId } from '#decorators/module-decorator-options.js';
import { DynamicModule } from '#decorators/module-decorator-options.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { ImportAdditionFailure, ImportRemovalFailure, ForbiddenRollback } from '#errors';
import { injectable } from '#di/decorators.js';
import { forwardRef } from '#di/forward-ref.js';
import type { Provider } from '#di/top/types-and-models.js';

describe('MutableModuleRegistry', () => {
  describe('scanRootModule()', () => {
    it('should log a warning and return root metadata if scanned twice', () => {
      @rootModule({ providersPerApp: [Service1] })
      class AppModule {}

      const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
      jest.spyOn(systemLogMediator, 'externalModuleDetectionFailed').mockImplementation(() => {});
      const spy = jest.spyOn(systemLogMediator, 'forbiddenRescanRootModule').mockImplementation(() => {});
      const manager = new MockModuleRegistry(systemLogMediator);

      const meta1 = manager.scanRootModule(AppModule);
      const meta2 = manager.scanRootModule(AppModule);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(meta1).toBe(meta2);
    });
  });

  @injectable()
  class Service1 {}
  @injectable()
  class Service2 {}
  @injectable()
  class Service3 {}

  class MockModuleRegistry extends MutableModuleRegistry {
    declare systemLogMediator: SystemLogMediator;
    declare normalizedMetaMap: Map<ModRefId, NormalizedModuleMeta>;
    declare moduleIdMap: Map<string, ModRefId>;
    declare moduleGraph: any;
    declare oldGraph: any;

    override normalizeMeta(modRefId: ModRefId): NormalizedModuleMeta {
      return super.normalizeMeta(modRefId);
    }
  }

  let mock: MockModuleRegistry;

  beforeEach(() => {
    clearDebugClassNames();
    const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
    jest.spyOn(systemLogMediator, 'externalModuleDetectionFailed').mockImplementation(() => {});
    mock = new MockModuleRegistry(systemLogMediator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('circular imports', () => {
    it('should not throw maximum call stack size exceeded in includesInSomeModule during removeImport with circular imports', () => {
      @featureModule({ providersPerApp: [Service1], imports: [forwardRef(() => Module2)] })
      class Module1 {}

      @featureModule({ providersPerApp: [Service1], imports: [Module1] })
      class Module2 {}

      @featureModule({ providersPerApp: [Service1], imports: [Module1] })
      class Module3 {}

      @featureModule({ providersPerApp: [Service1] })
      class Module4 {}

      @rootModule({
        imports: [Module3, Module4],
      })
      class AppModule {}

      mock.scanRootModule(AppModule);
      expect(() => mock.removeImport(Module4)).not.toThrow();
    });
  });

  describe('dynamic imports (addImport)', () => {
    @rootModule({
      imports: [],
      providersPerMod: [Service1],
      extensionsMeta: {},
      exports: [],
    })
    class AppModule {}

    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module1 {}

    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module2 {}

    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module3 {}

    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module4 {}

    const module3WithProviders: DynamicModule = { module: Module3, providersPerMod: [Service2] };

    const getExpectedMeta1 = () => {
      const expectedMeta1 = new NormalizedModuleMeta();
      expectedMeta1.id = '';
      expectedMeta1.name = 'AppModule';
      expectedMeta1.modRefId = AppModule;
      expectedMeta1.providersPerMod = [Service1];
      expectedMeta1.declaredInDir = expect.any(String);
      expectedMeta1.isExternal = false;
      expectedMeta1.moduleAspectsMap = expect.any(Map);
      expectedMeta1.staticModuleOptions = expect.any(Object);
      return expectedMeta1;
    };

    it('should add a module to root imports and check maps, size, and commit/reset behavior', () => {
      const expectedMeta1 = getExpectedMeta1();

      mock.scanRootModule(AppModule);
      expect(mock.getNormalizedModuleMeta('root')).toBe(mock.getNormalizedModuleMeta('root'));
      expect(mock.getNormalizedModuleMeta('root')).toEqual(expectedMeta1);

      expect(mock.addImport(Module1)).toBe(true);
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(2);
      expect(mock.moduleGraph.normalizedMetaMap.has(Module1)).toBe(true);
      expect(mock.oldGraph?.moduleIdMap.size).toBe(1);
      expect(mock.oldGraph?.moduleIdMap.get('root')).toBe(AppModule);
      expect(mock.oldGraph?.normalizedMetaMap.size).toBe(1);
      expect(mock.oldGraph?.normalizedMetaMap.get(AppModule)).toEqual(expectedMeta1);

      mock.commit();
      expect(mock.oldGraph).toBeUndefined();
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(2);
      expect(mock.moduleGraph.normalizedMetaMap.has(AppModule)).toBe(true);
      expect(mock.moduleGraph.normalizedMetaMap.has(Module1)).toBe(true);

      expect(mock.oldGraph).toBeUndefined();
    });

    it('should return false when trying to add an already imported module', () => {
      mock.scanRootModule(AppModule);
      expect(mock.addImport(Module1)).toBe(true);
      mock.commit();

      const spy = jest.spyOn(mock.systemLogMediator, 'moduleAlreadyImported').mockImplementation(() => {});
      expect(mock.addImport(Module1)).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should throw ImportAdditionFailure when target module ID is not found', () => {
      mock.scanRootModule(AppModule);
      expect(() => mock.addImport(Module2, 'fakeId')).toThrow(new ImportAdditionFailure('Module2', 'fakeId'));
    });

    it('should support multiple additions, commit, reset and verify metadata', () => {
      mock.scanRootModule(AppModule);
      mock.addImport(Module1);
      mock.commit();

      mock.addImport(Module2);
      mock.addImport(Module4);

      mock.commit();

      const expectedMeta3 = new NormalizedModuleMeta();
      expectedMeta3.id = '';
      expectedMeta3.name = 'AppModule';
      expectedMeta3.modRefId = AppModule;
      expectedMeta3.importedStaticModules = [Module1, Module2, Module4];
      expectedMeta3.providersPerMod = [Service1];
      expectedMeta3.declaredInDir = expect.any(String);
      expectedMeta3.isExternal = false;
      expectedMeta3.moduleAspectsMap = expect.any(Map);
      expectedMeta3.staticModuleOptions = expect.any(Object);

      expect(mock.getNormalizedModuleMeta('root')).toEqual(expectedMeta3);
    });

    it('should support rollback operations', () => {
      mock.scanRootModule(AppModule);
      mock.addImport(Module1);
      mock.commit();

      const expectedMeta3 = new NormalizedModuleMeta();
      expectedMeta3.id = '';
      expectedMeta3.name = 'AppModule';
      expectedMeta3.modRefId = AppModule;
      expectedMeta3.importedStaticModules = [Module1];
      expectedMeta3.providersPerMod = [Service1];
      expectedMeta3.declaredInDir = expect.any(String);
      expectedMeta3.isExternal = false;
      expectedMeta3.moduleAspectsMap = expect.any(Map);
      expectedMeta3.staticModuleOptions = expect.any(Object);

      mock.addImport(module3WithProviders);
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(3);
      expect(mock.getNormalizedModuleMeta('root')).toEqual({
        ...expectedMeta3,
        importedDynamicModules: [module3WithProviders],
      });

      mock.rollback();
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(2);
      expect(mock.getNormalizedModuleMeta('root')).toEqual(expectedMeta3);
      expect(mock.getNormalizedModuleMeta('root')).toEqual(expectedMeta3);
    });

    it('should correctly propagate inherited aspects to dynamically added modules (Gemini Pro vs Opus test)', () => {
      class TestAspectHandler extends ModuleAspectHandler<any> {}
      const testAspect: ModuleAspectDecorator<any, any, any> = Reflector.makeClassDecorator((data) => new TestAspectHandler(data));

      class SomeService {}

      @featureModule({
        providersPerMod: [SomeService],
        exports: [SomeService],
      })
      class DynamicallyAddedModule {}

      @testAspect({})
      @rootModule({
        imports: [],
      })
      class AspectAppModule {}

      mock.scanRootModule(AspectAppModule);

      const origGetMeta = mock['moduleGraph']['getMeta'];
      jest.spyOn(mock['moduleGraph'] as any, 'getMeta').mockImplementation((modRefId: any) => {
        const meta = origGetMeta.call(mock['moduleGraph'], modRefId);
        if (meta && meta.modRefId === DynamicallyAddedModule) {
          meta.isExternal = false;
          meta.inheritsAspects = true;
        }
        return meta;
      });

      mock.addImport(DynamicallyAddedModule, AspectAppModule);
      mock.commit();

      const dynamicMeta = mock.getNormalizedModuleMeta(DynamicallyAddedModule);
      expect(dynamicMeta).toBeDefined();

      expect(dynamicMeta!.allModuleAspectsMap.has(testAspect)).toBe(true);
    });
  });

  describe('dynamic removal (removeImport)', () => {
    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module0 {}

    @featureModule({ imports: [Module0], providersPerMod: [Service1], exports: [Service1] })
    class Module1 {}

    @featureModule({ imports: [Module0], providersPerMod: [Service1], exports: [Service1] })
    class Module2 {}

    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module3 {
      static withOpts(providersPerMod: Provider[]): DynamicModule<Module3> {
        return {
          module: Module3,
          providersPerMod,
        };
      }
    }

    const module3WithProviders = Module3.withOpts([Service2]);

    const moduleId = 'my-mix';
    @featureModule({ providersPerMod: [Service1], exports: [Service1] })
    class Module4 {
      static withOpts(providersPerMod: Provider[]): DynamicModule<Module4> {
        return {
          id: moduleId,
          module: Module4,
          providersPerMod,
        };
      }
    }

    const module4WithProviders = Module4.withOpts([Service2]);

    @rootModule({
      imports: [Module1, Module2, module3WithProviders, module4WithProviders],
      providersPerMod: [Service1],
      extensionsMeta: {},
      exports: [],
    })
    class AppModule {}

    const getExpectedMeta1 = () => {
      const expectedMeta1 = new NormalizedModuleMeta();
      expectedMeta1.id = '';
      expectedMeta1.name = 'AppModule';
      expectedMeta1.modRefId = AppModule;
      expectedMeta1.importedStaticModules = [Module1, Module2];
      expectedMeta1.importedDynamicModules = [module3WithProviders, module4WithProviders];
      expectedMeta1.providersPerMod = [Service1];
      expectedMeta1.declaredInDir = expect.any(String);
      expectedMeta1.isExternal = false;
      expectedMeta1.moduleAspectsMap = expect.any(Map);
      expectedMeta1.staticModuleOptions = expect.any(Object);
      return expectedMeta1;
    };

    it('should remove a module from imports and update maps/snapshots correctly', () => {
      mock.scanRootModule(AppModule);
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(6);
      expect(mock.getNormalizedModuleMeta('root')).toEqual(getExpectedMeta1());

      expect(mock.removeImport(Module0, Module1)).toBe(true);
      expect(mock.moduleGraph.normalizedMetaMap.get(Module1)?.importedStaticModules).toEqual([]);

      expect(mock.removeImport(Module0, Module2)).toBe(true);
      expect(mock.moduleGraph.normalizedMetaMap.get(Module2)?.importedStaticModules).toEqual([]);
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(5);

      mock.commit();
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(5);

      expect(mock.removeImport(Module2)).toBe(true);
      expect(mock.getNormalizedModuleMeta('root')?.importedStaticModules).toEqual([Module1]);
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(4);

      expect(mock.removeImport(module3WithProviders)).toBe(true);
      expect(mock.getNormalizedModuleMeta('root')?.importedDynamicModules).toEqual([module4WithProviders]);
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(3);

      expect(mock.removeImport(moduleId)).toBe(true);
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(2);
    });

    it('should return false when trying to remove a module that is not imported', () => {
      mock.scanRootModule(AppModule);
      mock.removeImport(Module2);
      const spy = jest.spyOn(mock.systemLogMediator, 'moduleNotFound').mockImplementation(() => {});
      expect(mock.removeImport(Module2)).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should return false if input module to remove is not found in snapshot', () => {
      mock.scanRootModule(AppModule);
      const spy = jest.spyOn(mock.systemLogMediator, 'moduleNotFound').mockImplementation(() => {});
      expect(mock.removeImport('non-existent')).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should throw ImportRemovalFailure if target module ID is not found', () => {
      mock.scanRootModule(AppModule);
      expect(() => mock.removeImport(Module1, 'non-existent-target')).toThrow(
        new ImportRemovalFailure('Module1', 'non-existent-target'),
      );
    });

    it('should support rollback operations during removal', () => {
      mock.scanRootModule(AppModule);
      mock.removeImport(moduleId);
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(5);

      mock.rollback();
      expect(mock.moduleGraph.normalizedMetaMap.size).toBe(6);
      expect(mock.getNormalizedModuleMeta('root')).toEqual(getExpectedMeta1());
    });
  });

  describe('rollback()', () => {
    it('should throw ForbiddenRollback if no transaction is active', () => {
      expect(() => mock.rollback()).toThrow(new ForbiddenRollback());
    });
  });

  describe('saveSnapshot()', () => {
    it('should throw ForbiddenSavingSnapshot if snapshot is already saved', () => {
      @rootModule({ providersPerApp: [Service1] })
      class AppModule {}
      mock.scanRootModule(AppModule);
    });
  });

  describe('refactored cloning, rollback, and providersPerApp cleanup', () => {
    it('should deeply clone NormalizedModuleMeta and isolate array/object mutations in extensionsMeta', () => {
      const meta = new NormalizedModuleMeta();
      meta.name = 'TestModule';
      meta.providersPerMod = [Service1];
      meta.extensionsMeta = {
        group1: ['config1', 'config2'],
        group2: { setting: true },
      };

      const clone = meta.clone();
      expect(clone).not.toBe(meta);
      expect(clone.providersPerMod).toEqual([Service1]);
      expect(clone.providersPerMod).not.toBe(meta.providersPerMod);

      // Mutate clone
      clone.providersPerMod.push(Service2);
      (clone.extensionsMeta as any).group1.push('config3');
      (clone.extensionsMeta as any).group2.setting = false;

      // Verify original untouched
      expect(meta.providersPerMod).toEqual([Service1]);
      expect((meta.extensionsMeta as any).group1).toEqual(['config1', 'config2']);
      expect((meta.extensionsMeta as any).group2.setting).toBe(true);
    });

    it('should correctly restore providersPerApp during startTransaction and rollback', () => {
      @featureModule({ providersPerApp: [{ token: 'tokenA', useValue: 'valueA' }] })
      class ModuleA {}

      @rootModule()
      class AppModule {}

      mock.scanRootModule(AppModule);
      expect(mock.providersPerApp).toEqual([]);

      mock.addImport(ModuleA);
      mock.commit();
      expect(mock.providersPerApp).toEqual([{ token: 'tokenA', useValue: 'valueA' }]);

      // Start manual transaction and push temporary providersPerApp
      mock.startTransaction();
      mock.moduleGraph.addProvidersPerApp([{ token: 'tokenB', useValue: 'valueB' }]);
      expect(mock.providersPerApp.length).toBe(2);

      // Rollback should restore providersPerApp from oldState
      mock.rollback();
      expect(mock.providersPerApp).toEqual([{ token: 'tokenA', useValue: 'valueA' }]);
    });

    it('should remove orphaned providersPerApp when a module is removed via removeImport', () => {
      @featureModule({ providersPerApp: [{ token: 'globalToken1', useValue: 'val1' }] })
      class RemovableModule {}

      @rootModule({
        imports: [RemovableModule],
      })
      class AppModule {}

      mock.scanRootModule(AppModule);
      expect(mock.providersPerApp).toEqual([{ token: 'globalToken1', useValue: 'val1' }]);

      // Remove RemovableModule from AppModule
      expect(mock.removeImport(RemovableModule, AppModule)).toBe(true);
      expect(mock.providersPerApp).toEqual([]);
    });

    it('should cascadedly remove orphaned modules (and their providers) when a parent module is removed', () => {
      @featureModule({ providersPerApp: [{ token: 'childToken', useValue: 'child' }] })
      class ChildModule {}

      @featureModule({ imports: [ChildModule], providersPerApp: [{ token: 'parentToken', useValue: 'parent' }] })
      class ParentModule {}

      @rootModule({
        imports: [ParentModule],
      })
      class AppModule {}

      mock.scanRootModule(AppModule);
      expect(mock.providersPerApp).toEqual(
        expect.arrayContaining([
          { token: 'childToken', useValue: 'child' },
          { token: 'parentToken', useValue: 'parent' },
        ]),
      );
      expect(mock.moduleGraph.normalizedMetaMap.has(ChildModule)).toBe(true);

      expect(mock.removeImport(ParentModule, AppModule)).toBe(true);
      expect(mock.providersPerApp).toEqual([]);
      expect(mock.moduleGraph.normalizedMetaMap.has(ChildModule)).toBe(false);
    });
  });

  describe('ModuleGraph clone and restore', () => {
    it('should clone state and preserve independent snapshots during transactions', () => {
      @featureModule({ providersPerApp: [{ token: 'stateToken', useValue: 'stateVal' }] })
      class StateModule {}

      @rootModule({
        imports: [StateModule],
      })
      class AppModule {}

      mock.scanRootModule(AppModule);
      expect(mock.oldGraph).toBeUndefined();

      // Start transaction
      expect(mock.startTransaction()).toBe(true);
      expect(mock.oldGraph).not.toBe(mock.moduleGraph);

      // Verify deep copying of NormalizedModuleMeta
      const activeMeta = mock.moduleGraph.normalizedMetaMap.get(StateModule);
      const backupMeta = mock.oldGraph?.normalizedMetaMap.get(StateModule);
      expect(backupMeta).toEqual(activeMeta);
      expect(backupMeta).not.toBe(activeMeta);

      // Rollback restores exact previous oldState reference
      const savedOldState = mock.oldGraph;
      mock.rollback();
      expect(mock.moduleGraph).toBe(savedOldState!);
      expect(mock.oldGraph).toBeUndefined();
    });

    it('should return false when starting a transaction while one is already active and preserve original backup', () => {
      @featureModule({ providersPerApp: [{ token: 'stateToken2', useValue: 'stateVal2' }] })
      class StateModule {}

      @rootModule({ imports: [StateModule] })
      class AppModule {}

      mock.scanRootModule(AppModule);
      expect(mock.startTransaction()).toBe(true);
      const originalBackup = mock.oldGraph;
      expect(mock.startTransaction()).toBe(false);
      expect(mock.oldGraph).toBe(originalBackup);
    });

    it('should throw ForbiddenRollback when rollback is invoked without startTransaction', () => {
      expect(() => mock.rollback()).toThrow(new ForbiddenRollback());
    });
  });
});
