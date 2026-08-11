import type { SystemLogMediator } from '#logger/system-log-mediator.js';
import { defaultExtensionProviders } from '#extension/default-extensions-providers.js';
import { defaultProvidersPerApp } from './default-providers-per-app.js';
import type { ModuleManager } from '#init/module-manager.js';
import { BaseAppOptions } from '#init/base-app-options.js';
import type { BaseImportRegistry, ShallowModuleImports } from '#init/types.js';
import type { ResolvedModuleMeta } from '#types/metadata-per-mod.js';
import type { Level, AnyObj } from '#types/mix.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { AnyFn, Provider } from '#di/top/types-and-models.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ReflectiveDependency } from '#utils/get-dependencies.js';
import { getDependencies } from '#utils/get-dependencies.js';
import { getLastProviders } from '#utils/get-last-providers.js';
import { getProviderName } from '#utils/get-provider-name.js';
import { getProvidersTargets, getTokens } from '#utils/get-tokens.js';
import { ExtensionCounters } from '#extension/extension-types.js';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import { ProvidersByLevel } from '#types/providers-metadata.js';
import { CyclicImports, NoProviderDuringImportResolution, ProviderImportFailure } from '#errors';
import { ModuleInfo } from '#types/module-extract.js';
import { stringify } from '#di/stringify.js';
import { input } from '#di/decorators.js';
import { isClassProvider, isFactoryProvider, isMultiProvider, isTokenProvider, isValueProvider } from '#di/utils.js';
import { Injector } from '#di/injector.js';

/**
 * By analyzing the dependencies of the providers returned by `ShallowModulesImporter`,
 * recursively collects providers for them from the corresponding modules.
 */
export class DeepModulesImporter {
  protected dependencyChain: [ModRefId, Provider][] = [];
  protected tokensPerApp: any[];
  /**
   * @todo Describe the purpose of this
   */
  protected extensionsTokens: any[] = [];
  protected extensionCounters = new ExtensionCounters();

  protected moduleManager: ModuleManager;
  protected shallowModuleImportsMap: Map<ModRefId, ShallowModuleImports>;
  protected providersPerApp: Provider[];
  protected log: SystemLogMediator;

  constructor({
    moduleManager,
    shallowModuleImportsMap,
    providersPerApp,
    log,
  }: {
    moduleManager: ModuleManager;
    shallowModuleImportsMap: Map<ModRefId, ShallowModuleImports>;
    providersPerApp: Provider[];
    log: SystemLogMediator;
  }) {
    this.moduleManager = moduleManager;
    this.shallowModuleImportsMap = shallowModuleImportsMap;
    this.providersPerApp = providersPerApp;
    this.log = log;
  }

  importModulesDeep() {
    const levels: Level[] = ['Req', 'Rou', 'Mod'];
    const resolvedModuleMetaMap = new Map<ModRefId, ResolvedModuleMeta>();
    this.tokensPerApp = getTokens(this.providersPerApp);
    this.shallowModuleImportsMap.forEach(
      ({ normalizedModuleMeta, orderedExtensions, baseImportRegistry, initImportRegistryMap }, modRefId) => {
        try {
          const deepImportedModules = new Map<AnyFn, AnyObj>();
          resolvedModuleMetaMap.set(modRefId, { normalizedModuleMeta, orderedExtensions, deepImportedModules });
          const targetProviders = new ProvidersByLevel<Provider[]>();
          this.resolveImportedProviders(targetProviders, baseImportRegistry, levels);
          this.resolveProvidersForExtensions(normalizedModuleMeta, baseImportRegistry);
          const useValue: ModuleInfo = {
            moduleName: normalizedModuleMeta.name,
            isExternal: normalizedModuleMeta.isExternal,
          };
          normalizedModuleMeta.providersPerMod.unshift({ token: ModuleInfo, useValue });
          normalizedModuleMeta.providersPerMod.unshift(...targetProviders.providersPerMod);
          normalizedModuleMeta.providersPerRou.unshift(...targetProviders.providersPerRou);
          normalizedModuleMeta.providersPerReq.unshift(...targetProviders.providersPerReq);
          normalizedModuleMeta.allModuleAspectsMap.forEach((moduleMixin, decorator) => {
            const shallowImportedModule = initImportRegistryMap.get(decorator)!;
            const deepImports = moduleMixin.importModulesDeep({
              parent: this,
              shallowModuleImports: shallowImportedModule,
              moduleManager: this.moduleManager,
              shallowModuleImportsMap: this.shallowModuleImportsMap,
              providersPerApp: this.providersPerApp,
              log: this.log,
            });
            if (deepImports === undefined) {
              deepImportedModules.set(decorator, shallowImportedModule);
            } else {
              deepImportedModules.set(decorator, deepImports);
            }
          });
        } catch (err: any) {
          throw new ProviderImportFailure(normalizedModuleMeta.name, err);
        }
      },
    );

    return { extensionCounters: this.extensionCounters, resolvedModuleMetaMap };
  }

  protected resolveImportedProviders(
    targetProviders: ProvidersByLevel<Provider[]>,
    baseImportRegistry: BaseImportRegistry,
    levels: Level[],
  ) {
    levels.forEach((level, i) => {
      baseImportRegistry[`per${level}`].forEach((importedProvider) => {
        targetProviders[`providersPer${level}`].unshift(...importedProvider.providers);
        importedProvider.providers.forEach((provider) => {
          this.fetchDeps(targetProviders, importedProvider.modRefId, provider, levels.slice(i));
        });
      });

      baseImportRegistry[`multiPer${level}`].forEach((multiProviders, srcModule) => {
        targetProviders[`providersPer${level}`].unshift(...multiProviders);
        multiProviders.forEach((provider) => {
          this.fetchDeps(targetProviders, srcModule, provider, levels.slice(i));
        });
      });
    });
  }

  protected resolveProvidersForExtensions(targetProviders: NormalizedModuleMeta, baseImportRegistry: BaseImportRegistry) {
    const currentExtensionsProviders: any[] = [];
    baseImportRegistry.extensionProviders.forEach((p) => currentExtensionsProviders.push(...p));
    this.extensionsTokens = getTokens([...defaultExtensionProviders, ...currentExtensionsProviders, input]);
    baseImportRegistry.extensionGroupTokens.forEach((importedGroupTokens) => {
      importedGroupTokens.forEach((groupToken, ext) => {
        this.extensionsTokens.push(groupToken, ext);
      });
    });
    this.mergeExtensionProviders(targetProviders, baseImportRegistry);
    this.increaseExtensionCounters(targetProviders);
  }

  protected mergeExtensionProviders(targetProviders: NormalizedModuleMeta, baseImportRegistry: BaseImportRegistry) {
    baseImportRegistry.extensionProviders.forEach((importedProviders, srcModRefId) => {
      // Select only those imported providers that are not in the current module. Multi-providers are all transferred.
      const newProviders = importedProviders.filter((impProvider) => {
        if (isMultiProvider(impProvider)) {
          return true;
        }
        for (const ep of targetProviders.extensionProviders) {
          if (ep === impProvider) {
            return false;
          }
          if (isClassProvider(ep) && isClassProvider(impProvider)) {
            const equal = ep.token === impProvider.token && ep.useClass === impProvider.useClass;
            if (equal) {
              return false;
            }
          }
          if (isTokenProvider(ep) && isTokenProvider(impProvider)) {
            const equal = ep.token === impProvider.token && ep.useToken === impProvider.useToken;
            if (equal) {
              return false;
            }
          }
          if (isFactoryProvider(ep) && isFactoryProvider(impProvider)) {
            const equal = ep.token === impProvider.token && ep.useFactory === impProvider.useFactory;
            if (equal) {
              return false;
            }
          }
          if (isValueProvider(ep) && isValueProvider(impProvider)) {
            const equal = ep.token === impProvider.token && ep.useValue === impProvider.useValue;
            if (equal) {
              return false;
            }
          }
        }
        return true;
      });

      targetProviders.extensionProviders.unshift(...newProviders);

      const newGroupProviders: Provider[] = [];
      baseImportRegistry.extensionGroupTokens.get(srcModRefId)?.forEach((groupToken, ext) => {
        if (!targetProviders.extensionGroupTokensMap.has(ext)) {
          targetProviders.extensionGroupTokensMap.set(ext, groupToken);
          newGroupProviders.push({ token: groupToken, useToken: ext, multi: true });
        }
      });

      targetProviders.extensionProviders.unshift(...newGroupProviders);
      importedProviders.concat(newGroupProviders).forEach((provider) => {
        if (this.hasUnresolvedDeps(targetProviders.modRefId, provider, ['Mod'])) {
          this.fetchDeps(targetProviders, srcModRefId, provider, ['Mod']);
        }
      });
    });
  }

  protected increaseExtensionCounters(normalizedModuleMeta: NormalizedModuleMeta) {
    const extensionProviders = [...normalizedModuleMeta.extensionProviders];
    const uniqTargets = new Set<Provider>(getProvidersTargets(extensionProviders));

    uniqTargets.forEach((target) => {
      const counter = this.extensionCounters.extensionsMap.get(target) || 0;
      this.extensionCounters.extensionsMap.set(target, counter + 1);
    });
  }

  /**
   * @param targetProviders These are metadata of the module where providers are imported.
   * @param srcModRefId Module from where imports providers.
   * @param provider Imported provider.
   * @param levels Search in this levels. The level order is important.
   */
  fetchDeps(
    targetProviders: ProvidersByLevel<Provider[]>,
    srcModRefId: ModRefId,
    provider: Provider,
    levels: Level[],
    path: any[] = [],
    childLevels: string[] = [],
  ) {
    const srcNormalizedModuleMeta = this.moduleManager.getNormalizedModuleMeta(srcModRefId, true);

    for (const dep of this.getDependencies(provider)) {
      let found: boolean = false;
      if (this.extensionsTokens.includes(dep.token)) {
        continue;
      }

      for (const level of levels) {
        const srcProviders = getLastProviders(srcNormalizedModuleMeta[`providersPer${level}`]);

        getTokens(srcProviders).forEach((srcToken, i) => {
          if (srcToken === dep.token) {
            const importedProvider2 = srcProviders[i];
            targetProviders[`providersPer${level}`].unshift(importedProvider2);
            found = true;
            this.fetchDependenciesAgain(targetProviders, srcModRefId, importedProvider2, levels, path, childLevels);

            // The loop does not breaks because there may be multi providers.
          }
        });

        if (found) {
          break;
        }
      }

      if (!found && !this.tokensPerApp.includes(dep.token)) {
        this.fetchImportedDeps(targetProviders, srcModRefId, provider, levels, path, dep, childLevels);
      }
    }
  }

  /**
   * @param targetProviders These are metadata of the module where providers are imported.
   * @param srcModRefId1 Module from where imports providers.
   * @param provider Imported provider.
   * @param dep ReflectiveDependecy with token for dependecy of imported provider.
   */
  fetchImportedDeps(
    targetProviders: ProvidersByLevel<Provider[]>,
    srcModRefId1: ModRefId,
    provider: Provider,
    levels: Level[],
    path: any[] = [],
    dep: ReflectiveDependency,
    childLevels: string[] = [],
  ) {
    let found = false;
    const shallowModuleImports = this.shallowModuleImportsMap.get(srcModRefId1)!;
    for (const level of levels) {
      const importedProvider = shallowModuleImports.baseImportRegistry[`per${level}`].get(dep.token);
      if (importedProvider) {
        found = true;
        path.push(dep.token);
        const { modRefId: modRefId2, providers: srcProviders2 } = importedProvider;
        targetProviders[`providersPer${level}`].unshift(...srcProviders2);

        // Loop for multi providers.
        for (const srcProvider2 of srcProviders2) {
          this.fetchDependenciesAgain(targetProviders, modRefId2, srcProvider2, levels, path, childLevels);
        }
        break;
      }
    }

    if (!found && dep.required) {
      this.throwError(shallowModuleImports.normalizedModuleMeta, provider, path, dep.token, [...childLevels, ...levels]);
    }
  }

  protected fetchDependenciesAgain(
    targetProviders: ProvidersByLevel<Provider[]>,
    srcModRefId: ModRefId,
    provider: Provider,
    levels: Level[],
    path: any[],
    childLevels: string[] = [],
  ) {
    this.addToUnfinishedSearchDependencies(srcModRefId, provider);
    this.fetchDeps(targetProviders, srcModRefId, provider, levels, path, childLevels);
    this.deleteFromUnfinishedSearchDependencies(srcModRefId, provider);
  }

  protected nextHasUnresolvedDeps(srcModRefId: ModRefId, provider: Provider, levels: Level[]) {
    this.addToUnfinishedSearchDependencies(srcModRefId, provider);
    const hasUnresolvedDeps = this.hasUnresolvedDeps(srcModRefId, provider, levels);
    this.deleteFromUnfinishedSearchDependencies(srcModRefId, provider);
    return hasUnresolvedDeps;
  }

  protected hasUnresolvedDeps(srcModRefId: ModRefId, provider: Provider, levels: Level[]) {
    const normalizedModuleMeta = this.moduleManager.getNormalizedModuleMeta(srcModRefId, true);

    for (const dep of this.getDependencies(provider)) {
      let found: boolean = false;
      if (this.extensionsTokens.includes(dep.token)) {
        continue;
      }

      forLevel: for (const level of levels) {
        const srcProviders = getLastProviders(normalizedModuleMeta[`providersPer${level}`]);
        const srcTokens = getTokens(srcProviders);

        for (let i = 0; i < srcTokens.length; i++) {
          const srcToken = srcTokens[i];
          if (srcToken === dep.token) {
            found = true;
            const importedProvider2 = srcProviders[i];
            const hasUnresolvedDeps = this.nextHasUnresolvedDeps(srcModRefId, importedProvider2, levels);
            if (hasUnresolvedDeps) {
              found = false;
              break forLevel;
            }

            // The loop does not breaks because there may be multi providers.
          }
        }

        if (found) {
          break;
        }
      }

      if (!found && !this.tokensPerApp.includes(dep.token)) {
        if (this.hasUnresolvedImportedDeps(srcModRefId, levels, dep)) {
          return true;
        }
      }
    }
    return false;
  }

  protected hasUnresolvedImportedDeps(srcModRefId1: ModRefId, levels: Level[], dep: ReflectiveDependency) {
    let found = false;
    const shallowModuleImports = this.shallowModuleImportsMap.get(srcModRefId1)!;
    forLevel: for (const level of levels) {
      const importedProvider = shallowModuleImports.baseImportRegistry[`per${level}`].get(dep.token);
      if (importedProvider) {
        found = true;
        const { modRefId: modRefId2, providers: srcProviders2 } = importedProvider;

        // Loop for multi providers.
        for (const srcProvider2 of srcProviders2) {
          const hasUnresolvedDeps = this.nextHasUnresolvedDeps(modRefId2, srcProvider2, levels);
          if (hasUnresolvedDeps) {
            found = false;
            break forLevel;
          }
        }
        break;
      }
    }

    if (!found && dep.required) {
      return true;
    }
    return false;
  }

  throwError(normalizedModuleMeta: NormalizedModuleMeta, provider: Provider, path: any[], token: any, levels: string[]) {
    path = [provider, ...path, token];
    const strPath = getTokens(path)
      .map((t) => stringify(t.name || t))
      .join(' -> ');

    const levelsPath = levels
      .concat('App' as any)
      .map((level) => `providersPer${level}`)
      .join(', ');
    const partMsg = path.length > 1 ? `(required by ${strPath}). Searched in ${levelsPath}` : levelsPath;
    // this.log.showProvidersInLogs(this, meta.name, meta.providersPerReq, meta.providersPerRou, meta.providersPerMod);

    throw new NoProviderDuringImportResolution(normalizedModuleMeta.name, token.name || token, partMsg);
  }

  getDependencies(provider: Provider) {
    const deps = getDependencies(provider);

    const defaultTokens = [
      ...getTokens([
        //
        ...defaultProvidersPerApp,
        // ...defaultProvidersPerReq,
      ]),
      Injector,
      BaseAppOptions,
    ];

    return deps.filter((d) => !defaultTokens.includes(d.token));
  }

  addToUnfinishedSearchDependencies(modRefId: ModRefId, provider: Provider) {
    const index = this.dependencyChain.findIndex(([m, p]) => m === modRefId && p === provider);
    if (index != -1) {
      this.throwCircularDependencies(index);
    }
    this.dependencyChain.push([modRefId, provider]);
  }

  deleteFromUnfinishedSearchDependencies(modRefId: ModRefId, provider: Provider) {
    const index = this.dependencyChain.findIndex(([m, p]) => m === modRefId && p === provider);
    this.dependencyChain.splice(index, 1);
  }

  throwCircularDependencies(index: number) {
    const items = this.dependencyChain;
    const prefixChain = items.slice(0, index);
    const circularChain = items.slice(index);

    const prefixNames = prefixChain
      .map(([m, p]) => {
        const debugModuleName = getDebugClassName(m);
        return `[${getProviderName(p)} in ${debugModuleName}]`;
      })
      .join(' -> ');

    const [modRefId, provider] = items[index];
    let circularNames = circularChain
      .map(([m, p]) => {
        const debugModuleName = getDebugClassName(m);
        return `[${getProviderName(p)} in ${debugModuleName}]`;
      })
      .join(' -> ');

    const debugModuleName = getDebugClassName(modRefId);
    circularNames += ` -> [${getProviderName(provider)} in ${debugModuleName}]`;
    throw new CyclicImports(circularNames, prefixNames);
  }
}
