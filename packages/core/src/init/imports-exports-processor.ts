import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { RootModuleOptions } from '#decorators/root-module.js';
import type { Level } from '#types/mix.js';
import type { MultiProvider } from '#di/utils.js';
import { getTokens, getToken } from '#utils/get-tokens.js';
import { resolveAllForwardRefs } from '#init/forward-refs-resolver.js';
import { isDynamicModule, isModuleDecorator, isRootModule } from '#decorators/type-guards.js';
import { isNormalizedProvider } from '#di/utils.js';
import { Reflector } from '#di/reflector.js';
import { stringify } from '#utils/ng-utils.js';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import { UndefinedSymbol, ForbiddenNormalizedExport, UnknownExport, ForbiddenAppExport, ReexportFailure } from '#errors';

export class ImportsExportsProcessor {
  normalizeImports(staticModuleOptions: RootModuleOptions, meta: NormalizedModuleMeta) {
    resolveAllForwardRefs(staticModuleOptions.imports as any[]).forEach((imp: any, i: number) => {
      if (imp === undefined) {
        throw new UndefinedSymbol('Imports', meta.name, i);
      }
      if (isDynamicModule(imp)) {
        meta.importedDynamicModules.push(imp);
      } else {
        meta.importedStaticModules.push(imp);
      }
    });
  }

  normalizeExports(moduleOptions: { exports?: any[] }, action: 'Static exports' | 'Dynamic exports', meta: NormalizedModuleMeta) {
    if (!moduleOptions.exports) {
      return;
    }
    const tokensAtAllLevels = getTokens(meta.providersPerApp.concat(meta.providersPerMod, meta.providersPerRou, meta.providersPerReq));

    resolveAllForwardRefs(moduleOptions.exports as any[]).forEach((exp: any, i: number) => {
      if (exp === undefined) {
        throw new UndefinedSymbol(action, meta.name, i);
      }
      if (isNormalizedProvider(exp)) {
        throw new ForbiddenNormalizedExport(meta.name, exp.token.name || exp.token);
      }
      if (isDynamicModule(exp)) {
        if (!meta.exportedDynamicModules.includes(exp)) {
          meta.exportedDynamicModules.push(exp);
        }
      } else if (tokensAtAllLevels.includes(exp)) {
        this.exportProviders(exp, meta);
      } else if (Reflector.getClassLevelMeta(exp)?.some(isModuleDecorator)) {
        if (!meta.exportedStaticModules.includes(exp)) {
          meta.exportedStaticModules.push(exp);
        }
      } else {
        throw new UnknownExport(meta.name, stringify(exp));
      }
    });
  }

  protected exportProviders(token: any, meta: NormalizedModuleMeta): void {
    let found = false;
    (['Mod', 'Rou', 'Req'] satisfies Level[]).forEach((level) => {
      const providers = meta[`providersPer${level}`].filter((p) => getToken(p) === token);
      if (providers.length) {
        found = true;
        if (providers.some((p: any) => p.multi)) {
          meta[`exportedMultiProvidersPer${level}`].push(...(providers as MultiProvider[]));
        } else {
          meta[`exportedProvidersPer${level}`].push(...providers);
        }
      }
    });

    if (!found) {
      const providerName = token.name || token;
      if (meta.providersPerApp.some((p) => getToken(p) === token)) {
        throw new ForbiddenAppExport(meta.name, providerName);
      } else {
        throw new UnknownExport(meta.name, providerName);
      }
    }
  }

  assertReexportedModulesAreImported(meta: NormalizedModuleMeta) {
    if (isRootModule(meta.staticModuleOptions)) {
      // Allow exporting from the root module without importing.
      return;
    }
    const imports = [...meta.importedStaticModules, ...meta.importedDynamicModules];
    const exports = [...meta.exportedStaticModules, ...meta.exportedDynamicModules];

    exports.forEach((modRefId) => {
      if (!imports.includes(modRefId)) {
        throw new ReexportFailure(meta.name, getDebugClassName(modRefId) || '""');
      }
    });
  }
}
