import { AppOptions } from '#types/app-options.js';
import { controller } from '#types/controller.js';
import {
  featureModule,
  injectable,
  Logger,
  ModuleInfo,
  ModuleRegistry,
  DynamicModule,
  Provider,
  rootModule,
  SystemLogMediator,
  ImportedProvider,
  DynamicModuleWithAspectOptions,
  ModRefId,
  ShallowModuleImports,
} from '@holu/core';
import { RestAppInitializer } from './rest-app-initializer.js';
import { Router } from '../services/router.js';
import { restAspect } from '#decorators/rest-module-aspects.js';

function getImportedTokens(map: Map<any, ImportedProvider<Provider>> | undefined) {
  return [...(map || [])].map(([key]) => key);
}

describe('RestAppInitializer', () => {
  @injectable()
  class AppInitializerMock extends RestAppInitializer {
    override collectProvidersShallow(moduleRegistry: ModuleRegistry) {
      return super.collectProvidersShallow(moduleRegistry);
    }
  }

  let mock: AppInitializerMock;
  let moduleRegistry: ModuleRegistry;

  describe('exports/imports', () => {
    class Provider0 {}
    class Provider1 {}
    class Provider2 {}
    class Provider3 {}
    class Provider4 {}
    class Provider5 {}
    class Provider6 {}
    class Provider7 {}
    class Provider8 {}
    class Provider9 {}

    @controller()
    class Ctrl {}

    @featureModule({
      exports: [Provider0],
      providersPerMod: [Provider0],
    })
    class Module0 {}

    const obj1 = { token: Provider1, useClass: Provider1 };
    @restAspect({ controllers: [Ctrl] })
    @featureModule({
      providersPerMod: [obj1, Provider2],
      exports: [Provider1],
    })
    class Module1 {}

    @featureModule({
      providersPerMod: [Provider3, Provider4],
      exports: [Provider3, Provider4],
    })
    class Module2 {
      static withOpts() {
        return { module: Module2 };
      }
    }

    @restAspect({ providersPerReq: [Provider5, Provider6, Provider7], exports: [Provider5, Provider6, Provider7] })
    @featureModule({})
    class Module3 {}

    @restAspect({ providersPerReq: [Provider8, Provider9], exports: [Provider8, Provider9] })
    @featureModule()
    class Module4 {}

    @featureModule({
      providersPerApp: [{ token: Logger, useValue: 'fake value' }],
    })
    class Module5 {}

    const module2WithOpts: DynamicModule = Module2.withOpts();
    const module3WithOpts: DynamicModuleWithAspectOptions = { module: Module3, dynamicAspectOptionsMap: new Map() };
    module3WithOpts.dynamicAspectOptionsMap.set(restAspect, { path: 'one' });
    const module4WithOpts: DynamicModule = { module: Module4 };
    @rootModule({
      imports: [Module0, Module1, module2WithOpts, Module5, module3WithOpts, module4WithOpts],
      exports: [Module0, module2WithOpts, module3WithOpts],
      providersPerApp: [Logger, { token: Router, useValue: 'fake' }],
    })
    class AppModule {}

    let shallowModuleImportsBase: Map<ModRefId, ShallowModuleImports>;

    beforeAll(() => {
      const systemLogMediator = new SystemLogMediator({ moduleName: 'fakeName' });
      moduleRegistry = new ModuleRegistry(systemLogMediator);
      const appOptions = new AppOptions();
      mock = new AppInitializerMock(appOptions, moduleRegistry, systemLogMediator);
      moduleRegistry.scanRootModule(AppModule);
      shallowModuleImportsBase = mock.collectProvidersShallow(moduleRegistry);
    });

    function checkAppProviders(shallowModuleImports: ShallowModuleImports | undefined) {
      const tokensPerMod = getImportedTokens(shallowModuleImports?.baseImportRegistry.perMod).slice(0, 3);
      expect(tokensPerMod).toEqual([Provider0, Provider3, Provider4]);
      const tokensPerReq = getImportedTokens(shallowModuleImports?.baseImportRegistry.perReq).slice(0, 3);
      expect(tokensPerReq).toEqual([Provider5, Provider6, Provider7]);

      // App providers per a module
      const perMod = shallowModuleImports?.baseImportRegistry?.perMod!;
      const expectedPerMod = new ImportedProvider();

      expectedPerMod.modRefId = Module0;
      expectedPerMod.providers = [Provider0];
      expect(perMod.get(Provider0)).toEqual(expectedPerMod);

      expectedPerMod.modRefId = module2WithOpts;
      expectedPerMod.providers = [Provider3];
      expect(perMod.get(Provider3)).toEqual(expectedPerMod);
      expectedPerMod.providers = [Provider4];
      expect(perMod.get(Provider4)).toEqual(expectedPerMod);

      // App providers per a request
      const perReq = shallowModuleImports?.baseImportRegistry.perReq!;
      const expectedPerReq = new ImportedProvider();
      expectedPerReq.modRefId = module3WithOpts;
      expectedPerReq.providers = [Provider5];
      expect(perReq.get(Provider5)).toEqual(expectedPerReq);
      expectedPerReq.providers = [Provider6];
      expect(perReq.get(Provider6)).toEqual(expectedPerReq);
      expectedPerReq.providers = [Provider7];
      expect(perReq.get(Provider7)).toEqual(expectedPerReq);
    }

    it('Module0', async () => {
      const mod0 = shallowModuleImportsBase.get(Module0);
      expect(mod0?.normalizedModuleMeta.providersPerApp).toEqual([]);
      const moduleInfo: ModuleInfo = { path: '', moduleName: 'Module0', isExternal: false };
      const providerPerMod: Provider = { token: ModuleInfo, useValue: moduleInfo };
      expect(mod0?.normalizedModuleMeta.providersPerMod).toEqual([providerPerMod, Provider0]);
      expect(mod0?.normalizedModuleMeta.providersPerReq).toEqual([]);
      checkAppProviders(mod0);
    });

    it('Module1', async () => {
      const mod1 = shallowModuleImportsBase.get(Module1);
      expect(mod1?.normalizedModuleMeta.providersPerApp).toEqual([]);
      const moduleInfo: ModuleInfo = { path: '', moduleName: 'Module1', isExternal: false };
      const providerPerMod: Provider = { token: ModuleInfo, useValue: moduleInfo };
      expect(mod1?.normalizedModuleMeta.providersPerMod).toEqual([providerPerMod, obj1, Provider2]);
      checkAppProviders(mod1);
    });

    it('Module2', async () => {
      const mod2 = shallowModuleImportsBase.get(module2WithOpts);
      expect(mod2?.normalizedModuleMeta.providersPerApp).toEqual([]);
      const moduleInfo: ModuleInfo = { path: '', moduleName: 'Module2', isExternal: false };
      const providerPerMod: Provider = { token: ModuleInfo, useValue: moduleInfo };
      expect(mod2?.normalizedModuleMeta.providersPerMod).toEqual([providerPerMod, Provider3, Provider4]);
      expect(mod2?.normalizedModuleMeta.providersPerReq).toEqual([]);
      checkAppProviders(mod2);
    });

    it('Module3', async () => {
      const mod3 = shallowModuleImportsBase.get(module3WithOpts);
      expect(mod3?.normalizedModuleMeta.providersPerApp).toEqual([]);
      const moduleInfo: ModuleInfo = { path: 'one', moduleName: 'Module3', isExternal: false };
      const providerPerMod: Provider = {
        token: ModuleInfo,
        useValue: moduleInfo,
      };
      expect(mod3?.normalizedModuleMeta.providersPerMod).toEqual([providerPerMod]);
      expect(mod3?.normalizedModuleMeta.providersPerReq).toEqual([Provider5, Provider6, Provider7]);
      checkAppProviders(mod3);
    });

    it('Module4', async () => {
      moduleRegistry.scanRootModule(AppModule);
      const shallowModuleImportsBase = mock.collectProvidersShallow(moduleRegistry);
      const mod4 = shallowModuleImportsBase.get(module4WithOpts);
      expect(mod4?.normalizedModuleMeta.providersPerApp).toEqual([]);
      const moduleInfo: ModuleInfo = { path: '', moduleName: 'Module4', isExternal: false };
      const providerPerMod: Provider = { token: ModuleInfo, useValue: moduleInfo };
      expect(mod4?.normalizedModuleMeta.providersPerMod).toEqual([providerPerMod]);
      expect(mod4?.normalizedModuleMeta.providersPerReq).toEqual([Provider8, Provider9]);
      checkAppProviders(mod4);
    });

    it('AppModule', async () => {
      moduleRegistry.scanRootModule(AppModule);
      const shallowModuleImportsBase = mock.collectProvidersShallow(moduleRegistry);
      const root1 = shallowModuleImportsBase.get(AppModule);
      expect(root1?.normalizedModuleMeta.providersPerApp.slice(0, 2)).toEqual([Logger, { token: Router, useValue: 'fake' }]);
      const moduleInfo: ModuleInfo = { path: '', moduleName: 'AppModule', isExternal: false };
      const providerPerMod: Provider = {
        token: ModuleInfo,
        useValue: moduleInfo,
      };
      expect(root1?.normalizedModuleMeta.providersPerMod).toEqual([providerPerMod]);
      expect(root1?.normalizedModuleMeta.providersPerReq).toEqual([]);
      checkAppProviders(root1);
      expect(getImportedTokens(root1?.baseImportRegistry.perMod)).toEqual([Provider0, Provider3, Provider4, Provider1]);
      expect(getImportedTokens(root1?.baseImportRegistry.perReq)).toEqual([Provider5, Provider6, Provider7, Provider8, Provider9]);
    });
  });
  it('should works without providersPerApp', () => {
    @controller()
    class Controller1 {}

    @restAspect({ controllers: [Controller1] })
    @featureModule()
    class Module7 {}

    const meta = moduleRegistry.scanRootModule(Module7);
    const providersPerApp = mock.collectProvidersPerApp(meta);
    expect(providersPerApp).toEqual([]);
  });
});
