import {
  AnyObj,
  clearDebugClassNames,
  featureModule,
  forwardRef,
  AppProviders,
  injectable,
  ModRefId,
  ModuleManager,
  StaticModule,
  DynamicModule,
  NormalizedModuleMeta,
  Provider,
  rootModule,
  SystemLogMediator,
  ShallowModulesImporter as ShallowModulesImporterBase,
} from '@holu/core';

import { controller } from '#types/controller.js';
import { RestAppendOptions } from './rest-aspect-raw-meta.js';
import { restAspect } from '#decorators/rest-module-aspects.js';
import { RestShallowModulesImporter } from './rest-shallow-modules-importer.js';
import { Level } from '#types/types.js';
import { ModuleMustHaveControllers } from '#services/rest-errors.js';
import { LevelCollisionNotFound } from '@holu/core/errors';

@injectable()
class MockShallowModulesImporter extends RestShallowModulesImporter {
  declare prefixPerMod: string;
  override moduleName = 'MockModule';
  override normalizedModuleMeta = new NormalizedModuleMeta();
  // override guardsPerMod: ModuleScopedGuard[] = [];

  protected override getResolvedCollisionsPerLevel(level: Level, token1: any): { module2: ModRefId<AnyObj>; providers: Provider[] } {
    return super.getResolvedCollisionsPerLevel(level, token1);
  }
}

let mock: MockShallowModulesImporter;
let moduleManager: ModuleManager;

beforeEach(() => {
  clearDebugClassNames();
  mock = new MockShallowModulesImporter();
  const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
  moduleManager = new ModuleManager(systemLogMediator);
});

describe('shallow importing modules', () => {
  function importModulesShallow(modRefId: StaticModule) {
    expect(() => moduleManager.scanRootModule(modRefId)).not.toThrow();
    new ShallowModulesImporterBase().importModulesShallow({
      appProviders: new AppProviders(),
      modRefId,
      moduleManager,
      unfinishedScanModules: new Set(),
    });
    const appProviders = new ShallowModulesImporterBase().exportAppProviders(moduleManager);
    return mock.importModulesShallow({
      modRefId: modRefId,
      appProviders,
      unfinishedScanModules: new Set(),
      moduleManager,
      prefixPerMod: '',
    });
  }

  xit('cyclic dependencies between modules', () => {
    class Provider1 {}
    class Provider2 {}

    const dynamicModule0: DynamicModule = { module: forwardRef(() => Module3) };
    @restAspect()
    @featureModule({
      imports: [dynamicModule0],
      exports: [dynamicModule0],
    })
    class Module1 {}
    const dynamicModule1: DynamicModule = { module: Module1 };

    @restAspect({
      providersPerReq: [Provider1],
      exports: [Provider1],
    })
    @featureModule({ imports: [dynamicModule1], exports: [dynamicModule1] })
    class Module2 {}
    const dynamicModule2: DynamicModule = { module: Module2 };

    @restAspect({
      providersPerReq: [Provider2],
      exports: [Provider2],
    })
    @featureModule({ imports: [dynamicModule2], exports: [dynamicModule2] })
    class Module3 {}

    @rootModule({
      imports: [Module3],
      exports: [Module3],
    })
    class AppModule {}

    const normalizedModuleMeta = moduleManager.scanRootModule(AppModule);
    const moduleAspect = normalizedModuleMeta.allModuleAspectsMap.get(restAspect)!;
    moduleAspect.exportAppProviders({
      moduleManager,
      appProviders: new AppProviders(),
      normalizedModuleMeta,
    });
    // expect(getImportedProviders(val.importedProvidersPerReq)).toEqual([Provider2, Provider1]);
  });

  it('should throw an error because resolvedCollisionsPerReq not properly setted provider', () => {
    class Provider1 {}
    class Provider2 {}

    @featureModule({
      providersPerMod: [Provider2],
      exports: [Provider2],
    })
    class Module0 {}

    @restAspect({ providersPerReq: [{ token: Provider1, useValue: 'some value' }], exports: [Provider1] })
    @featureModule()
    class Module1 {}

    @restAspect({ providersPerReq: [Provider1], exports: [Provider1] })
    @featureModule()
    class Module2 {}

    @restAspect({
      resolvedCollisionsPerReq: [[Provider1, Module0]],
    })
    @rootModule({ imports: [Module0, Module1, Module2] })
    class AppModule {}

    const err = new LevelCollisionNotFound('AppModule', 'Module0', 'Req', 'Provider1');
    expect(() => importModulesShallow(AppModule)).toThrow(err);
  });

  xit('should throw an error because AppModule have resolvedCollisionsPerReq when there is no collisions', () => {
    class Provider1 {}
    class Provider2 {}

    @restAspect({ providersPerReq: [Provider1], exports: [Provider1] })
    @featureModule()
    class Module1 {}

    @restAspect({ providersPerReq: [Provider2], exports: [Provider2] })
    @featureModule()
    class Module2 {}

    @restAspect({ resolvedCollisionsPerReq: [[Provider1, Module1]] })
    @rootModule({ imports: [Module1, Module2] })
    class AppModule {}

    const msg = 'Provider1 mapped with Module1, but there are no collisions with Provider1 in the providersPerReq';
    expect(() => importModulesShallow(AppModule)).toThrow(msg);
  });

  it('should work with resolved collision', () => {
    class Provider1 {}
    class Provider2 {}

    @restAspect({ providersPerReq: [Provider1], exports: [Provider1] })
    @featureModule()
    class Module1 {}

    @restAspect({
      providersPerReq: [{ token: Provider1, useValue: 'some value' }, Provider2],
      exports: [Provider1, Provider2],
    })
    @featureModule()
    class Module2 {}

    @rootModule({
      imports: [Module1, Module2],
    })
    class AppModule {}

    let msg = 'Importing providers to AppModule failed: exports from Module1, Module2 causes collision with Provider1. ';
    msg += 'You should add Provider1 to resolvedCollisionsPerReq in this module. ';
    msg += 'For example: resolvedCollisionsPerReq: [ [Provider1, Module1] ].';
    expect(() => importModulesShallow(AppModule)).toThrow(msg);
  });

  it('should work with resolved collision', () => {
    class Provider1 {}

    @restAspect({ providersPerReq: [{ token: Provider1, useValue: 'some value' }], exports: [Provider1] })
    @featureModule()
    class Module1 {}

    @restAspect({ providersPerReq: [Provider1], exports: [Provider1] })
    @featureModule()
    class Module2 {}

    const modRefId1: DynamicModule = { module: Module1 };
    const modRefId2: DynamicModule = { module: Module2 };
    @restAspect({
      resolvedCollisionsPerReq: [[Provider1, modRefId1]],
    })
    @rootModule({ imports: [modRefId1, modRefId2] })
    class AppModule {}

    expect(() => importModulesShallow(AppModule)).not.toThrow();
  });

  it('should work with resolved collision in restAspect and import a module in rootModule', () => {
    class Provider1 {}

    @restAspect({ providersPerReq: [{ token: Provider1, useValue: 'some value' }], exports: [Provider1] })
    @featureModule()
    class Module1 {}

    @restAspect({ providersPerReq: [Provider1], exports: [Provider1] })
    @featureModule()
    class Module2 {}

    const modRefId1: DynamicModule = { module: Module1 };
    const modRefId2: DynamicModule = { module: Module2 };
    @restAspect({ resolvedCollisionsPerReq: [[Provider1, modRefId1]] })
    @rootModule({ imports: [modRefId1, modRefId2] })
    class AppModule {}

    expect(() => importModulesShallow(AppModule)).not.toThrow();
  });

  it('should not throw an error during appending modules', () => {
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module2 {}

    @restAspect({
      appends: [Module1, { path: 'some-prefix', module: Module2 }],
      controllers: [Controller1],
    })
    @rootModule()
    class AppModule {}

    expect(() => importModulesShallow(AppModule)).not.toThrow();
  });

  it('map should have some properties', () => {
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module2 {}

    const mod1: RestAppendOptions = { path: 'prefix1', module: Module1 };
    const mod2: RestAppendOptions = { path: 'prefix2', module: Module2 };
    @restAspect({
      appends: [mod1, mod2],
      controllers: [Controller1],
    })
    @rootModule()
    class AppModule {}

    const map = importModulesShallow(AppModule);
    expect(map.size).toBe(5);

    const shallowModuleImports_1 = map.get(mod1)!;
    const shallowModuleImports_2 = map.get(mod2)!;
    const shallowModuleImports_3 = map.get(AppModule)!;
    expect(shallowModuleImports_1).toBeDefined();
    expect(shallowModuleImports_2).toBeDefined();
    expect(shallowModuleImports_3).toBeDefined();

    expect(shallowModuleImports_1.prefixPerMod).toBe('prefix1');
    expect(shallowModuleImports_1.normalizedModuleMeta).toBeDefined();
    // expect(shallowModuleImports_1.applyControllers).toBe(true);

    expect(shallowModuleImports_2.prefixPerMod).toBe('prefix2');
    expect(shallowModuleImports_3.prefixPerMod).toBe('');
    // expect(shallowModuleImports_2.applyControllers).toBe(true);
    // expect(shallowModuleImports_3.applyControllers).toBe(false);
  });

  it('should throw an error during importing and appending same module', () => {
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module1 {}

    @restAspect({
      appends: [Module1],
      controllers: [Controller1],
    })
    @rootModule({ imports: [Module1] })
    class AppModule {}

    const msg = 'Appends to "AppModule" failed: "Module1" includes in both: imports and appends arrays';
    expect(() => importModulesShallow(AppModule)).toThrow(msg);
  });

  it('should throw an error during appending module without controllers (common module)', () => {
    class Provider1 {}
    class Provider2 {}
    @controller()
    class Controller1 {}

    @featureModule({
      providersPerMod: [Provider1, Provider2],
      exports: [Provider1, Provider2],
    })
    class Module1 {}

    @restAspect({
      appends: [Module1],
      controllers: [Controller1],
    })
    @rootModule()
    class AppModule {}

    const msg = 'Appends to "AppModule" failed: "Module1" must have controllers';
    expect(() => importModulesShallow(AppModule)).toThrow(msg);
  });

  it('should throw an error during appending module without controllers (RestAppendOptions)', () => {
    class Provider1 {}
    class Provider2 {}

    @featureModule({
      providersPerMod: [Provider1, Provider2],
      exports: [Provider1, Provider2],
    })
    class Module1 {}

    @restAspect({
      appends: [{ path: '', module: Module1 }],
    })
    @rootModule()
    class AppModule {}

    const err = new ModuleMustHaveControllers('AppModule', 'Module1-DynamicModule');
    expect(() => importModulesShallow(AppModule)).toThrow(err);
  });

  it('should not throw an error during appending module with controllers', () => {
    class Provider1 {}
    class Provider2 {}
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule({
      providersPerMod: [Provider1, Provider2],
      exports: [Provider1, Provider2],
    })
    class Module1 {}

    @restAspect({
      appends: [Module1],
      controllers: [Controller1],
    })
    @rootModule()
    class AppModule {}

    expect(() => importModulesShallow(AppModule)).not.toThrow();
  });

  it('should not throw an error during appending modules', () => {
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module2 {}

    @restAspect({
      appends: [Module1, { path: 'some-prefix', module: Module2 }],
      controllers: [Controller1],
    })
    @rootModule()
    class AppModule {}

    expect(() => importModulesShallow(AppModule)).not.toThrow();
  });

  it('map should have some properties', () => {
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module2 {}

    const mod1: RestAppendOptions = { path: 'prefix1', module: Module1 };
    const mod2: RestAppendOptions = { path: 'prefix2', module: Module2 };
    @restAspect({
      appends: [mod1, mod2],
      controllers: [Controller1],
    })
    @rootModule()
    class AppModule {}

    const map = importModulesShallow(AppModule);
    expect(map.size).toBe(5);

    const shallowModuleImports_1 = map.get(mod1)!;
    const shallowModuleImports_2 = map.get(mod2)!;
    const shallowModuleImports_3 = map.get(AppModule)!;
    expect(shallowModuleImports_1).toBeDefined();
    expect(shallowModuleImports_2).toBeDefined();
    expect(shallowModuleImports_3).toBeDefined();

    expect(shallowModuleImports_1.prefixPerMod).toBe('prefix1');
    expect(shallowModuleImports_1.normalizedModuleMeta).toBeDefined();
    // expect(shallowModuleImports_1.applyControllers).toBe(true);

    expect(shallowModuleImports_2.prefixPerMod).toBe('prefix2');
    expect(shallowModuleImports_3.prefixPerMod).toBe('');
    // expect(shallowModuleImports_2.applyControllers).toBe(true);
    // expect(shallowModuleImports_3.applyControllers).toBe(false);
  });
});
