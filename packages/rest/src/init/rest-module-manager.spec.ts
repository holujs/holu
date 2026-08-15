import { jest } from '@jest/globals';
import {
  DynamicModule,
  ModuleRegistry,
  NormalizedModuleMeta,
  clearDebugClassNames,
  SystemLogMediator,
  featureModule,
  Extension,
  rootModule,
  injectable,
  forwardRef,
  Provider,
  DynamicModuleWithAspectOptions,
  ModRefId,
  ForwardRefFn,
  AllModuleAspectsMap,
} from '@holu/core';
import {
  UnknownExport,
  ForbiddenNormalizedExport,
  InvalidExtension,
  MeaninglessModuleMetadata,
  NormalizationFailure,
  MissingRootDecorator,
} from '@holu/core/errors';

import { controller } from '../types/controller.js';
import { restAspect, restRootModule } from '#decorators/rest-module-aspects.js';
import { RestAppendOptions } from './rest-aspect-raw-meta.js';
import { RestAspectMeta } from './rest-aspect-meta.js';
import { CanActivate, guard } from '#interceptors/guard.js';
import { RequestContext } from '#services/request-context.js';
import { RestModule } from './rest.module.js';

describe('ModuleRegistry', () => {
  // console.log = jest.fn();
  type ModuleId = string | ModRefId;

  class MockModuleRegistry extends ModuleRegistry {
    declare normalizedMetaMap: Map<ModRefId, NormalizedModuleMeta>;
    declare moduleIdMap: Map<string, ModRefId>;

    override scanModule(modRefId: ModRefId | ForwardRefFn<ModRefId>) {
      const meta = super.scanModule(modRefId);
      this.propagateAspectsAndValidate(meta.modRefId);
      return meta;
    }
  }

  let mock: MockModuleRegistry;
  function getAspectMeta(moduleId: ModuleId) {
    const normalizedModuleMeta = mock.getNormalizedModuleMeta(moduleId);
    // console.log(normalizedModuleMeta);
    return normalizedModuleMeta?.normalizedAspectMetaMap.get(restAspect);
  }

  beforeEach(() => {
    clearDebugClassNames();
    const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
    jest.spyOn(systemLogMediator, 'externalModuleDetectionFailed').mockImplementation(() => {});
    mock = new MockModuleRegistry(systemLogMediator);
  });

  describe('quickCheckMeta()', () => {
    it('should throw an error, when no export, no extensions and no controllers', () => {
      class Provider1 {}

      @featureModule({ providersPerMod: [Provider1] })
      class Module1 {}

      const err = new MeaninglessModuleMetadata('Module1');
      expect(() => mock.scanModule(Module1)).toThrow(err);
    });

    it('should works, when no export and no controllers, but appends with prefix', () => {
      class Provider1 {}

      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module1 {}

      @restAspect({ appends: [{ path: 'v1', module: Module1 }] })
      @featureModule()
      class Module2 {}

      expect(() => mock.scanModule(Module2)).not.toThrow();
    });

    it('should works with extension only', () => {
      class Ext implements Extension {
        async stage1() {}
      }

      @featureModule({ extensions: [{ extension: Ext, export: true }] })
      class Module1 {}

      expect(() => mock.scanModule(Module1)).not.toThrow();
    });

    it('should not throw an error, when exports some provider', () => {
      class Provider1 {}

      @featureModule({
        providersPerMod: [Provider1],
        exports: [Provider1],
      })
      class Module1 {}

      expect(() => mock.scanModule(Module1)).not.toThrow();
    });

    it('should not throw an error, when declare some controller', () => {
      @controller()
      class Controller1 {}

      @restAspect({ controllers: [Controller1] })
      @featureModule()
      class Module1 {}

      expect(() => mock.scanModule(Module1)).not.toThrow();
    });
  });

  it('populate in restAspect providers per a module and per an application', () => {
    class Service1 {}
    class Service2 {}
    class Service3 {}
    class Service4 {}
    class Service5 {}
    class Service6 {}

    @restAspect({
      providersPerApp: [Service3],
      providersPerMod: [Service4],
    })
    @featureModule({
      providersPerApp: [Service1],
      providersPerMod: [Service2],
    })
    class Module1 {}

    @restAspect({
      imports: [Module1],
      providersPerApp: [Service5],
      providersPerMod: [Service6],
    })
    @rootModule()
    class AppModule {}

    mock.scanRootModule(AppModule);
    const rootNormalizedModuleMeta = mock.normalizedMetaMap.get(AppModule);
    const normalizedModuleMeta1 = mock.normalizedMetaMap.get(Module1);

    expect(normalizedModuleMeta1?.providersPerApp).toEqual([Service1, Service3]);
    expect(normalizedModuleMeta1?.providersPerMod.includes(Service2)).toBeTruthy();
    expect(normalizedModuleMeta1?.providersPerMod.includes(Service4)).toBeTruthy();
    expect(rootNormalizedModuleMeta?.providersPerApp).toEqual([Service5]);
    expect(rootNormalizedModuleMeta?.providersPerMod.includes(Service6)).toBeTruthy();

    const mod1AspectMeta = normalizedModuleMeta1?.normalizedAspectMetaMap.get(restAspect);
    expect(mod1AspectMeta?.providersPerApp).toEqual(normalizedModuleMeta1?.providersPerApp);
    expect(mod1AspectMeta?.providersPerMod).toEqual(normalizedModuleMeta1?.providersPerMod);
    expect(mod1AspectMeta?.providersPerMod.includes(Service2)).toBeTruthy();
    expect(mod1AspectMeta?.providersPerMod.includes(Service4)).toBeTruthy();

    const rootAspectMeta = rootNormalizedModuleMeta?.normalizedAspectMetaMap.get(restAspect);
    expect(rootAspectMeta?.providersPerApp).toEqual(rootNormalizedModuleMeta?.providersPerApp);
    expect(rootAspectMeta?.providersPerMod).toEqual(rootNormalizedModuleMeta?.providersPerMod);
    expect(rootAspectMeta?.providersPerMod.includes(Service6)).toBeTruthy();
  });

  it('empty root module with rootModule decorator only', () => {
    @rootModule()
    class AppModule {}

    mock.scanRootModule(AppModule);
    expect(mock.normalizedMetaMap.size).toBe(1);
    expect(mock.normalizedMetaMap.get(AppModule)).toBeDefined();
  });

  it('empty root module with restAspect decorator', () => {
    @restRootModule()
    class AppModule {}

    mock.scanRootModule(AppModule);
    expect(mock.normalizedMetaMap.size).toBe(3);
    expect(mock.normalizedMetaMap.get(AppModule)).toBeDefined();
    expect(mock.normalizedMetaMap.get(RestModule)).toBeDefined();
  });

  it('non properly exports from root module', () => {
    class Provider1 {}

    @rootModule({ exports: [Provider1] })
    class AppModule {}

    const err = new NormalizationFailure('AppModule', new UnknownExport('AppModule', 'Provider1'));
    expect(() => mock.scanRootModule(AppModule)).toThrow(err);
  });

  it('root module with some metadata', () => {
    @injectable()
    class Provider1 {}

    @restAspect({ providersPerRou: [], providersPerReq: [Provider1] })
    @rootModule()
    class AppModule {}

    mock.scanRootModule(AppModule);
    expect(mock.normalizedMetaMap.size).toBe(3);
    expect(getAspectMeta('root')?.providersPerReq).toEqual([Provider1]);
  });

  it('root module without @rootModule decorator', () => {
    @featureModule()
    class Module1 {}

    const err = new MissingRootDecorator('Module1');
    expect(() => mock.scanRootModule(Module1)).toThrow(err);
  });

  it('root module imported module without @featureModule decorator', () => {
    class Module1 {}

    @rootModule({ imports: [Module1] })
    class Module2 {}

    const msg = '"Module1" does not have the "@rootModule()" or "@featureModule()" decorator';
    expect(() => mock.scanRootModule(Module2)).toThrow(msg);
  });

  it('properly reexport module with params', () => {
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module1 {}

    const dynamicModule: DynamicModule = { module: Module1 };

    @restAspect({ imports: [dynamicModule], exports: [dynamicModule] })
    @featureModule()
    class Module2 {}

    expect(() => mock.scanModule(Module2)).not.toThrow();
  });

  it('exports multi providers', () => {
    class Multi {}

    const exportedMultiProvidersPerMod = [{ token: Multi, useClass: Multi, multi: true }];

    @featureModule()
    class Module1 {
      static withOpts(): DynamicModule<Module1> {
        return {
          module: this,
          providersPerMod: [{ token: Multi, useClass: Multi, multi: true }],
          exports: [Multi],
        };
      }
    }

    const dynamicModule = Module1.withOpts();

    const meta = mock.scanModule(dynamicModule);
    expect(meta.exportedProvidersPerMod.length).toBe(0);
    expect(meta.exportedMultiProvidersPerMod).toEqual(exportedMultiProvidersPerMod);
  });

  it('not properly reexport module with params, case 2', () => {
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module1 {
      static withOpts(): DynamicModule<Module1> {
        return {
          module: this,
        };
      }
    }

    const dynamicModule = Module1.withOpts();

    @restAspect({ controllers: [Controller1] })
    @featureModule({
      imports: [dynamicModule],
      exports: [Module1],
    })
    class Module2 {}

    const msg = 'Reexport from Module2 failed: Module1 includes in exports, but not includes in imports';
    expect(() => mock.scanModule(Module2)).toThrow(msg);
  });

  it('exports module without imports it', () => {
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule({ exports: [Module1] })
    class Module2 {}

    expect(() => mock.scanModule(Module2)).toThrow(/Reexport from Module2 failed: Module1 includes in exports/);
  });

  it('module exported provider from providersPerApp', () => {
    @injectable()
    class Provider1 {}

    @featureModule({ providersPerApp: [Provider1], exports: [Provider1] })
    class Module2 {}

    expect(() => mock.scanModule(Module2)).toThrow(/includes in "providersPerApp" and "exports" of/);
  });

  it('module exported normalized provider', () => {
    @injectable()
    class Provider1 {}

    @restAspect({ providersPerReq: [Provider1] })
    @featureModule({ exports: [{ token: Provider1, useClass: Provider1 }] })
    class Module2 {}

    const err = new NormalizationFailure('Module2', new ForbiddenNormalizedExport('Module2', 'Provider1'));
    expect(() => mock.scanModule(Module2)).toThrow(err);
  });

  it('module exported invalid extension', () => {
    @injectable()
    class Extension1 {}

    @featureModule({ extensions: [{ extension: Extension1 as any, export: true }] })
    class Module2 {}

    const err = new NormalizationFailure('Module2', new InvalidExtension('Module2', 'Extension1'));
    expect(() => mock.scanModule(Module2)).toThrow(err);
  });

  it('module exported valid extension', () => {
    @injectable()
    class Extension1 implements Extension {
      async stage1() {}
    }

    @featureModule({ extensions: [{ extension: Extension1 as any, export: true }] })
    class Module2 {}

    expect(() => mock.scanModule(Module2)).not.toThrow();
  });

  it('root module with imported some other modules', () => {
    @controller()
    class Controller1 {}

    const fn = () => module4WithOpts;
    @restAspect({ controllers: [Controller1] })
    @featureModule({ imports: [forwardRef(fn)] })
    class Module1 {}

    @injectable()
    class Provider0 {}

    @injectable()
    class Provider1 {}

    @restAspect({ providersPerRou: [Provider1], exports: [Provider1] })
    @featureModule({
      imports: [Module1],
      providersPerMod: [Provider0],
      exports: [Provider0, Module1],
    })
    class Module2 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module4 {
      static withOpts(providersPerMod: Provider[]): DynamicModule<Module4> {
        return {
          module: Module4,
          providersPerMod,
        };
      }
    }

    @injectable()
    class Provider2 {}

    const module4WithOpts = Module4.withOpts([Provider2]);

    @restAspect({ controllers: [] })
    @rootModule({
      imports: [Module1, Module2],
      providersPerApp: [],
      extensionsMeta: {},
      exports: [],
    })
    class AppModule {}

    mock.scanRootModule(AppModule);
    expect(mock.normalizedMetaMap.size).toBe(6);
    expect(getAspectMeta(Module1)?.controllers).toEqual([Controller1]);

    expect(mock.normalizedMetaMap.get(Module2)?.normalizedAspectMetaMap.get(restAspect)?.providersPerRou).toEqual([Provider1]);
    expect(mock.normalizedMetaMap.get(Module2)?.normalizedAspectMetaMap.get(restAspect)?.exportedProvidersPerRou).toEqual([Provider1]);

    expect(getAspectMeta('root')?.importedStaticModules).toEqual([Module1, Module2, RestModule]);

    const aspectMeta = mock.normalizedMetaMap.get(module4WithOpts)?.normalizedAspectMetaMap.get(restAspect);
    expect(aspectMeta?.importedStaticModules).toEqual([RestModule]);
  });

  it('imports and appends with gruards for some modules', () => {
    @guard()
    class Guard1 implements CanActivate {
      async canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }

    @guard()
    class Guard2 implements CanActivate {
      async canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }

    @controller()
    class Controller1 {}

    @controller()
    class Controller2 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module1 {
      static withOpts(): DynamicModuleWithAspectOptions<Module1> {
        return {
          module: this,
          dynamicAspectOptionsMap: new Map(),
        };
      }
    }

    @restAspect({ controllers: [Controller2] })
    @featureModule()
    class Module2 {}

    const dynamicModule = Module1.withOpts();
    dynamicModule.dynamicAspectOptionsMap.set(restAspect, { path: 'module1', guards: [Guard1] });
    const appendsWithOpts: RestAppendOptions = { path: 'module2', module: Module2, guards: [Guard2] };

    @restAspect({ appends: [appendsWithOpts] })
    @rootModule({ imports: [dynamicModule] })
    class AppModule {}

    mock.scanRootModule(AppModule);
    expect(mock.normalizedMetaMap.size).toBe(5);
    expect(getAspectMeta(dynamicModule)?.params.guards).toMatchObject([{ guard: Guard1 }]);
    expect(getAspectMeta(appendsWithOpts)?.params.guards).toMatchObject([{ guard: Guard2 }]);
  });

  it('root module with imported some extension', () => {
    @injectable()
    class Extension1 implements Extension<void> {
      async stage1() {}
    }

    @featureModule({
      extensions: [{ extension: Extension1 as any, export: true }],
    })
    class Module1 {}

    @rootModule({
      imports: [Module1],
    })
    class Module3 {}

    const expectedMeta3 = new RestAspectMeta();
    delete (expectedMeta3 as any).extensionConfigs;
    delete (expectedMeta3 as any).exportedExtensionConfigs;

    const expectedMeta1 = new RestAspectMeta();
    delete (expectedMeta1 as any).extensionConfigs;
    delete (expectedMeta1 as any).exportedExtensionConfigs;

    mock.scanRootModule(Module3);
    expect(getAspectMeta('root')).toBeFalsy();
    expect(getAspectMeta(Module1)).toBeFalsy();
  });

  it('root module with exported globaly some extension', () => {
    @injectable()
    class Extension1 implements Extension<void> {
      async stage1() {}
    }

    @featureModule({
      extensions: [{ extension: Extension1 as any, export: true }],
    })
    class Module1 {}

    @rootModule({
      imports: [Module1],
      exports: [Module1],
    })
    class Module3 {}

    const expectedMeta3 = new RestAspectMeta();
    delete (expectedMeta3 as any).extensionConfigs;
    delete (expectedMeta3 as any).exportedExtensionConfigs;

    const expectedMeta1 = new RestAspectMeta();
    delete (expectedMeta1 as any).extensionConfigs;
    delete (expectedMeta1 as any).exportedExtensionConfigs;

    mock.scanRootModule(Module3);
    expect(getAspectMeta('root')).toBeFalsy();
    expect(getAspectMeta(Module1)).toBeFalsy();
  });

  it('split multi providers and common providers', () => {
    class Provider1 {}
    class Provider2 {}
    class Provider3 {}

    const providersPerReq: Provider[] = [
      { token: Provider2, useValue: 'val4', multi: true },
      { token: Provider1, useValue: 'val1', multi: true },
      { token: Provider1, useValue: 'val2', multi: true },
      { token: Provider1, useValue: 'val3', multi: true },
      Provider3,
    ];

    @restAspect({ providersPerReq, exports: [Provider2, Provider1, Provider3] })
    @featureModule()
    class Module1 {}

    @rootModule({
      imports: [Module1],
    })
    class AppModule {}

    const expectedMeta1 = {} as RestAspectMeta;
    expectedMeta1.importedStaticModules = [RestModule];
    expectedMeta1.exportedProvidersPerReq = [Provider3];
    expectedMeta1.providersPerReq = providersPerReq;
    expectedMeta1.exportedMultiProvidersPerReq = [
      { token: Provider2, useValue: 'val4', multi: true },
      { token: Provider1, useValue: 'val1', multi: true },
      { token: Provider1, useValue: 'val2', multi: true },
      { token: Provider1, useValue: 'val3', multi: true },
    ];

    mock.scanRootModule(AppModule);
    expect(getAspectMeta('root')?.importedStaticModules).toEqual([Module1]);
    expect(getAspectMeta(Module1)).toMatchObject(expectedMeta1);
  });
});
