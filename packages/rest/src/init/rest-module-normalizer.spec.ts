import {
  clearDebugClassNames,
  featureModule,
  forwardRef,
  ModuleRegistry,
  DynamicModuleWithAspectOptions,
  DynamicModule,
  ProviderBuilder,
  rootModule,
  SystemLogMediator,
} from '@holu/core';

import { restAspect, restRootModule } from '#decorators/rest-module-aspects.js';
import { controller } from '#types/controller.js';
import { CanActivate, NormalizedGuard } from '#interceptors/guard.js';
import { RequestContext } from '#services/request-context.js';
import { RestAppendOptions } from './rest-aspect-raw-meta.js';
import { RestModule } from './rest.module.js';
import { NormalizationFailure, ReexportFailure } from '@holu/core/errors';

describe('rest ModuleNormalizer', () => {
  let moduleRegistry: ModuleRegistry;

  beforeEach(() => {
    clearDebugClassNames();
    const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
    moduleRegistry = new ModuleRegistry(systemLogMediator);
  });

  it('module and append - both with params and without aspect decorator', () => {
    class Service0 {}

    @featureModule({ providersPerApp: [Service0] })
    class Module1 {
      static withOpts(): DynamicModuleWithAspectOptions<Module1> {
        return {
          module: this,
          dynamicAspectOptionsMap: new Map(),
        };
      }
    }

    @featureModule({ providersPerApp: [Service0] })
    class Module2 {}

    const dynamicModule = Module1.withOpts();
    dynamicModule.dynamicAspectOptionsMap.set(restAspect, { path: 'test1' });
    const appendWithOpts: RestAppendOptions = { module: Module2, path: 'test2' };

    // Although in `AppModule` `appendWithOpts` and `dynamicModule` are used in the context of the `restAspect` decorator, `Module1` and `Module2`
    // themselves do not have this decorator, so it's important that `Module1` and `Module2` are processed using the module aspects taken from `AppModule`.
    @restAspect({
      appends: [appendWithOpts],
    })
    @rootModule({
      imports: [dynamicModule],
    })
    class AppModule {}

    const meta1 = moduleRegistry.scanRootModule(AppModule).normalizedAspectsMetaMap.get(restAspect)!;
    expect(dynamicModule.dynamicAspectOptionsMap?.get(restAspect)).toEqual({ path: 'test1' });
    expect(meta1.appendsWithOpts).toEqual([appendWithOpts]);

    const meta2 = moduleRegistry.getNormalizedModuleMeta(dynamicModule, true).normalizedAspectsMetaMap.get(restAspect)!;
    expect(meta2.params.path).toEqual('test1');

    const meta3 = moduleRegistry.getNormalizedModuleMeta(appendWithOpts, true).normalizedAspectsMetaMap.get(restAspect)!;
    expect(meta3.params.path).toEqual('test2');
  });

  it('providers or modules with forwardRef', () => {
    class Service0 {}
    class Service1 {}
    class Service2 {}
    class Service3 {}
    class Service4 {}

    @featureModule({ providersPerApp: [Service0] })
    class Module1 {}

    @featureModule({ providersPerApp: [Service0] })
    class Module2 {
      static withOpts(id: string): DynamicModuleWithAspectOptions<Module2> {
        return {
          id,
          module: this,
          dynamicAspectOptionsMap: new Map(),
        };
      }
    }

    @featureModule({ providersPerApp: [Service0] })
    class Module3 {}

    @featureModule({ providersPerApp: [Service0] })
    class Module4 {}

    @featureModule({ providersPerApp: [Service0] })
    class Module5 {}

    @featureModule({ providersPerApp: [Service0] })
    class Module6 {}

    const module2WithOpts = forwardRef(() => {
      const module2WithOpts = Module2.withOpts('test-id');
      module2WithOpts.dynamicAspectOptionsMap.set(restAspect, { path: 'test1' });
      return module2WithOpts;
    });
    const module4WithOpts: DynamicModule = { module: forwardRef(() => Module4) };
    const appendWithOpts: RestAppendOptions = { module: forwardRef(() => Module6), path: 'test2' };
    @restAspect({
      appends: [forwardRef(() => Module5), appendWithOpts],
      providersPerRou: [
        forwardRef(() => Service1),
        { token: forwardRef(() => Service3), useClass: forwardRef(() => Service3), multi: true },
      ],
      providersPerReq: [
        forwardRef(() => Service2),
        { token: forwardRef(() => Service4), useToken: forwardRef(() => Service4), multi: true },
      ],
      resolvedCollisionsPerRou: [[forwardRef(() => Service1), forwardRef(() => Module3)]],
      resolvedCollisionsPerReq: [[forwardRef(() => Service2), module4WithOpts]],
      exports: [forwardRef(() => Service1), forwardRef(() => Service2), forwardRef(() => Service3), forwardRef(() => Service4)],
    })
    @rootModule({
      imports: [forwardRef(() => Module1), module2WithOpts],
    })
    class AppModule {}

    const normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);

    const meta1 = moduleRegistry.getNormalizedModuleMeta(AppModule, true).normalizedAspectsMetaMap.get(restAspect)!;
    expect(meta1.providersPerRou).toEqual([Service1, { token: Service3, useClass: Service3, multi: true }]);
    expect(meta1.providersPerReq).toEqual([Service2, { token: Service4, useToken: Service4, multi: true }]);
    expect(meta1.exportedProvidersPerRou).toEqual([Service1]);
    expect(meta1.exportedProvidersPerReq).toEqual([Service2]);
    expect(meta1.exportedMultiProvidersPerRou).toEqual([{ token: Service3, useClass: Service3, multi: true }]);
    expect(meta1.exportedMultiProvidersPerReq).toEqual([{ token: Service4, useToken: Service4, multi: true }]);
    expect(meta1.resolvedCollisionsPerRou).toEqual([[Service1, Module3]]);
    expect(meta1.resolvedCollisionsPerReq).toEqual([[Service2, { module: Module4 }]]);
    expect(meta1.appendsModules).toEqual([Module5]);
    expect(meta1.appendsWithOpts).toEqual([appendWithOpts]);

    const meta2 = moduleRegistry.getNormalizedModuleMeta('test-id', true).normalizedAspectsMetaMap.get(restAspect)!;
    expect(meta2.params.path).toEqual('test1');

    const meta3 = moduleRegistry.getNormalizedModuleMeta(appendWithOpts, true).normalizedAspectsMetaMap.get(restAspect)!;
    expect(meta3.params.path).toEqual('test2');

    expect(normalizedModuleMeta.importedStaticModules).toEqual([Module1, RestModule]);
    expect(normalizedModuleMeta.importedDynamicModules).toEqual([{ id: 'test-id', module: Module2, dynamicAspectOptionsMap: expect.any(Map) }]);
  });

  it('merge static metadata with append params', () => {
    class Service1 {}
    class Service2 {}
    class Guard1 implements CanActivate {
      canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }
    class Guard2 implements CanActivate {
      canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }

    @restAspect({
      providersPerRou: new ProviderBuilder().passThrough(Service1),
      providersPerReq: [Service2],
      exports: [Service1, Service2],
    })
    @featureModule()
    class Module1 {}

    const appendsWithOpts: RestAppendOptions = {
      path: 'one',
      guards: [Guard1, [Guard2, { property1: 'some-value' }]],
      module: Module1,
    };

    @restAspect({
      appends: [appendsWithOpts],
    })
    @rootModule()
    class AppModule {}

    const normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
    const meta1 = moduleRegistry.getNormalizedModuleMeta(AppModule, true).normalizedAspectsMetaMap.get(restAspect)!;
    const modRefIds = normalizedModuleMeta.allModuleAspectsMap.get(restAspect)?.getModulesToScan(meta1);
    expect(modRefIds).toEqual([appendsWithOpts]);
    expect(normalizedModuleMeta.importedStaticModules).toEqual([RestModule]);
    expect(normalizedModuleMeta.importedDynamicModules).toEqual([]);

    const meta2 = moduleRegistry.getNormalizedModuleMeta(appendsWithOpts, true).normalizedAspectsMetaMap.get(restAspect)!;
    expect(meta2.params.path).toBe('one');
    expect(meta2.params.guards).toEqual<NormalizedGuard[]>([
      { guard: Guard1 },
      { guard: Guard2, params: [{ property1: 'some-value' }] },
    ]);
    expect(meta2.providersPerRou).toEqual([Service1]);
    expect(meta2.providersPerReq).toEqual([Service2]);
    expect(meta2.exportedProvidersPerRou).toEqual([Service1]);
    expect(meta2.exportedProvidersPerReq).toEqual([Service2]);
  });

  xit('merge static metadata with import params', () => {
    class Service1 {}
    class Service2 {}
    class Service3 {}
    class Service4 {}
    class Service5 {}
    class Service6 {}
    class Service7 {}
    class Service8 {}
    class Guard1 implements CanActivate {
      canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }
    class Guard2 implements CanActivate {
      canActivate(ctx: RequestContext, params?: any[]) {
        return false;
      }
    }

    @restAspect({
      providersPerApp: [Service7],
      providersPerRou: new ProviderBuilder().passThrough(Service1),
      providersPerReq: [Service3],
      exports: [Service1, Service3],
    })
    @featureModule({ providersPerMod: [Service5] })
    class Module1 {
      static withOpts(): DynamicModuleWithAspectOptions<Module1> {
        return {
          module: this,
          dynamicAspectOptionsMap: new Map(),
        };
      }
    }

    const dynamicModule = Module1.withOpts();
    dynamicModule.dynamicAspectOptionsMap.set(restAspect, {
      path: 'one',
      guards: [Guard1, [Guard2, { property1: 'some-value' }]],
      providersPerApp: [Service8],
      providersPerMod: [Service6],
      providersPerRou: [Service2],
      providersPerReq: [Service4],

      // Here Service5 exports from static metadata
      exports: [Service2, Service4, Service5, Service6],
    });

    @restAspect()
    @rootModule({ imports: [dynamicModule] })
    class AppModule {}

    const normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
    const meta1 = moduleRegistry.getNormalizedModuleMeta(AppModule, true).normalizedAspectsMetaMap.get(restAspect)!;
    const modRefIds = normalizedModuleMeta.allModuleAspectsMap.get(restAspect)?.getModulesToScan(meta1);
    expect(modRefIds).toEqual([]);
    expect(normalizedModuleMeta.importedStaticModules).toEqual([RestModule]);
    expect(normalizedModuleMeta.importedDynamicModules).toEqual([dynamicModule]);

    const meta2 = moduleRegistry.getNormalizedModuleMeta(dynamicModule, true).normalizedAspectsMetaMap.get(restAspect)!;
    expect(meta2.params.path).toBe('one');
    expect(meta2.params.guards).toEqual<NormalizedGuard[]>([
      { guard: Guard1 },
      { guard: Guard2, params: [{ property1: 'some-value' }] },
    ]);
    expect(meta2.providersPerApp).toEqual([Service7, Service8]);
    expect(meta2.providersPerMod).toEqual([Service5, Service6]);
    expect(meta2.providersPerRou).toEqual([Service1, Service2]);
    expect(meta2.providersPerReq).toEqual([Service3, Service4]);
    expect(meta2.exportedProvidersPerMod).toEqual([Service5, Service6]);
    expect(meta2.exportedProvidersPerRou).toEqual([Service1, Service2]);
    expect(meta2.exportedProvidersPerReq).toEqual([Service3, Service4]);
  });

  it('normalize controllers, multi providers and resolved providers', () => {
    class Service1 {}
    class Service2 {}
    class Module1 {}
    class Module2 {}

    @controller()
    class Controller1 {}

    @restAspect({
      controllers: [Controller1],
      providersPerRou: [Service1, { token: Service2, useClass: Service2, multi: true }],
      resolvedCollisionsPerRou: [[Service1, Module1]],
      resolvedCollisionsPerReq: [[Service2, Module2]],
      exports: [Service1, Service2],
    })
    @rootModule()
    class AppModule {}

    const normalizedModuleMeta = moduleRegistry.scanRootModule(AppModule);
    const meta = normalizedModuleMeta.normalizedAspectsMetaMap.get(restAspect)!;
    expect(meta.controllers).toEqual([Controller1]);
    expect(meta.providersPerRou).toEqual([Service1, { token: Service2, useClass: Service2, multi: true }]);
    expect(meta.exportedProvidersPerRou).toEqual([Service1]);
    expect(meta.exportedMultiProvidersPerRou).toEqual([{ token: Service2, useClass: Service2, multi: true }]);
    expect(meta.providersPerReq.length).toBe(0);
    expect(meta.resolvedCollisionsPerRou).toEqual([[Service1, Module1]]);
    expect(meta.resolvedCollisionsPerReq).toEqual([[Service2, Module2]]);
  });

  it('export of modules without import', () => {
    class Service1 {}

    @featureModule({ providersPerApp: [Service1] })
    class Module1 {}

    @featureModule({ exports: [Module1] })
    class Module2 {}

    @restRootModule({ imports: [Module2] })
    class AppModule {}

    const cause = new ReexportFailure('Module2', 'Module1');
    const err = new NormalizationFailure('Module2', cause);
    expect(() => moduleRegistry.scanRootModule(AppModule)).toThrow(err);
  });
});
