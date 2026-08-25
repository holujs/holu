import type { AnyObj } from '#types/mix.js';
import type { FeatureModuleOptions, ModRefId, StaticModule } from '#decorators/module-decorator-options.js';
import type { Class, Provider } from '#di/top/types-and-models.js';
import type { DynamicModule } from '../decorators/module-decorator-options.js';
import type { BaseExtensionConfig, ExtensionConfig } from '#extension/extension-providers-and-configs.js';
import type {
  NormalizedAspectsMetaMap,
  ModuleAspectHandler,
  AllModuleAspectsMap,
  ModuleAspectDecorator,
} from '#decorators/module-aspects.js';
import type { ExtensionClass } from '#extension/extension-types.js';
import type { ExtensionGroupToken } from '#di/key-registry.js';
import type { MultiProvider } from '#di/utils.js';
import { objectKeys } from '#utils/object-keys.js';
import { ReservedMetaProp } from '#error/core-errors.js';
import type { RootModuleOptions } from '#decorators/root-module.js';

export class BaseNormalizedModuleMeta<A extends AnyObj = AnyObj> {
  /**
   * The module ID.
   */
  id?: string = '';
  /**
   * Static modules imported by this module.
   */
  importedStaticModules: StaticModule[];
  /**
   * Dynamic modules (modules with options) imported by this module.
   */
  importedDynamicModules: DynamicModule[];
  /**
   * Providers configured at the application scope (`providersPerApp`).
   */
  providersPerApp: Provider[];
  /**
   * Providers configured at the module scope (`providersPerMod`).
   */
  providersPerMod: Provider[];
  /**
   * Providers configured at the route scope (`providersPerRou`).
   */
  providersPerRou: Provider[];
  /**
   * Providers configured at the request scope (`providersPerReq`).
   */
  providersPerReq: Provider[];
  /**
   * Static modules exported by this module.
   */
  exportedStaticModules: StaticModule[];
  /**
   * Dynamic modules (modules with options) exported by this module.
   */
  exportedDynamicModules: DynamicModule[];
  /**
   * Module-scoped providers exported by this module.
   */
  exportedProvidersPerMod: Provider[];
  /**
   * Route-scoped providers exported by this module.
   */
  exportedProvidersPerRou: Provider[];
  /**
   * Request-scoped providers exported by this module.
   */
  exportedProvidersPerReq: Provider[];
  /**
   * Module-scoped multi-providers exported by this module.
   */
  exportedMultiProvidersPerMod: MultiProvider[];
  /**
   * Route-scoped multi-providers exported by this module.
   */
  exportedMultiProvidersPerRou: MultiProvider[];
  /**
   * Request-scoped multi-providers exported by this module.
   */
  exportedMultiProvidersPerReq: MultiProvider[];
  /**
   * Resolved provider collisions at the application scope.
   */
  resolvedCollisionsPerApp: [any, ModRefId][];
  /**
   * Resolved provider collisions at the module scope.
   */
  resolvedCollisionsPerMod: [any, ModRefId][];
  /**
   * Resolved provider collisions at the route scope.
   */
  resolvedCollisionsPerRou: [any, ModRefId][];
  /**
   * Resolved provider collisions at the request scope.
   */
  resolvedCollisionsPerReq: [any, ModRefId][];
  /**
   * Extension providers registered in this module.
   */
  extensionProviders: Provider[];
  /**
   * Extension providers exported by this module.
   */
  exportedExtensionProviders: Provider[];
  /**
   * Configurations for extensions registered in this module.
   */
  extensionConfigs: ExtensionConfig[];
  /**
   * Configurations for extensions exported by this module.
   */
  exportedExtensionConfigs: ExtensionConfig[];
  /**
   * This property allows you to pass any information to extensions.
   *
   * You must follow this rule: data for one extension - one key in `extensionsMeta` object.
   */
  extensionsMeta: A;
}

/**
 * Creates a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy | Proxy}
 * instance to forward property value assignments from the `AspectMeta` instance to the {@link NormalizedModuleMeta} instance. Here,
 * `AspectMeta` refers to the extended interface of normalized data that provides module aspects. This is done to simplify
 * synchronization between {@link NormalizedModuleMeta} and the metadata from aspect decorators.
 */
export function createAspectMetaProxy<T extends BaseNormalizedModuleMeta>(
  normalizedModuleMeta: NormalizedModuleMeta,
  AspectMetaClass: Class<T>,
): T {
  return new Proxy(new AspectMetaClass(), {
    get(meta, prop: keyof NormalizedModuleMeta, proxy) {
      if (Reflect.has(normalizedModuleMeta, prop)) {
        return Reflect.get(normalizedModuleMeta, prop, proxy);
      } else {
        return Reflect.get(meta, prop, proxy);
      }
    },
    set(meta, prop: keyof NormalizedModuleMeta, value, proxy) {
      if (Reflect.has(normalizedModuleMeta, prop) && Reflect.has(meta, prop)) {
        throw new ReservedMetaProp(prop as string, AspectMetaClass.name);
      } else if (Reflect.has(normalizedModuleMeta, prop)) {
        return Reflect.set(normalizedModuleMeta, prop, value, proxy);
      } else {
        return Reflect.set(meta, prop, value, proxy);
      }
    },
  });
}

/**
 * Normalized metadata taken from the `rootModule` or `featureModule` decorator.
 */
export class NormalizedModuleMeta<
  StaticModuleOpts extends RootModuleOptions | FeatureModuleOptions = FeatureModuleOptions,
  ModuleClassType extends AnyObj = AnyObj,
  ExtensionMeta extends AnyObj = AnyObj,
> extends BaseNormalizedModuleMeta<ExtensionMeta> {
  /**
   * Metadata returned by the decorator transformer for the module.
   */
  staticModuleOptions: StaticModuleOpts;
  /**
   * The module set here must be identical to the module
   * passed to "imports" or "exports" array of feature module metadata.
   */
  modRefId: ModRefId<ModuleClassType>;
  /**
   * The module name.
   */
  name: string;
  /**
   * The directory in which the class was declared.
   */
  declaredInDir: string;
  /**
   * Indicates whether this module is external to the application.
   */
  isExternal?: boolean;
  /**
   * @experimental
   *
   * Indicates whether this module inherits aspects from parent modules.
   */
  inheritsAspects?: boolean;
  /**
   * Contains instances of `ModuleAspectHandler` collected from current module.
   */
  moduleAspectsMap = new Map<ModuleAspectDecorator<any, any, any>, ModuleAspectHandler>();
  /**
   * Contains normalized aspects metadata collected from current module.
   */
  normalizedAspectsMetaMap: NormalizedAspectsMetaMap = new Map();
  /**
   * List of unique module aspects found in the current module and all imported modules.
   */
  allModuleAspectsMap: AllModuleAspectsMap = new Map();
  /**
   * The mapping between an extension specified in {@link BaseExtensionConfig.groups | ExtensionConfig.groups}
   * and the extension group token assigned to it.
   */
  extensionGroupTokensMap = new Map<ExtensionClass, ExtensionGroupToken>();
  /**
   * The mapping between an exported extension specified in {@link BaseExtensionConfig.groups | ExtensionConfig.groups}
   * and the extension group token assigned to it.
   */
  exportedExtensionGroupTokensMap = new Map<ExtensionClass, ExtensionGroupToken>();

  constructor() {
    super();
    this.importedStaticModules = [];
    this.importedDynamicModules = [];
    this.providersPerApp = [];
    this.providersPerMod = [];
    this.providersPerRou = [];
    this.providersPerReq = [];
    this.exportedStaticModules = [];
    this.exportedDynamicModules = [];
    this.exportedProvidersPerMod = [];
    this.exportedProvidersPerRou = [];
    this.exportedProvidersPerReq = [];
    this.exportedMultiProvidersPerMod = [];
    this.exportedMultiProvidersPerRou = [];
    this.exportedMultiProvidersPerReq = [];
    this.resolvedCollisionsPerApp = [];
    this.resolvedCollisionsPerMod = [];
    this.resolvedCollisionsPerRou = [];
    this.resolvedCollisionsPerReq = [];
    this.extensionProviders = [];
    this.exportedExtensionProviders = [];
    this.extensionConfigs = [];
    this.exportedExtensionConfigs = [];
    this.extensionsMeta = {} as ExtensionMeta;
  }

  /**
   * @experimental
   *
   * Creates a deep clone of the current normalized metadata instance, duplicating arrays, maps, and extension
   * configurations while re-evaluating initialization hooks to ensure complete metadata isolation.
   */
  clone(): this {
    const copy = Object.create(Object.getPrototypeOf(this)) as this;
    Object.assign(copy, this);

    objectKeys(copy).forEach((p) => {
      if (Array.isArray(copy[p])) {
        (copy as any)[p] = copy[p].slice();
      }
    });

    if (copy.extensionsMeta) {
      const extensionsMeta = { ...copy.extensionsMeta } as any;
      Reflect.ownKeys(extensionsMeta).forEach((key) => {
        const val = extensionsMeta[key];
        if (Array.isArray(val)) {
          extensionsMeta[key] = val.slice();
        } else if (val && typeof val == 'object' && val.constructor === Object) {
          extensionsMeta[key] = { ...val };
        }
      });
      copy.extensionsMeta = extensionsMeta;
    }

    copy.extensionGroupTokensMap = new Map(copy.extensionGroupTokensMap);
    copy.exportedExtensionGroupTokensMap = new Map(copy.exportedExtensionGroupTokensMap);
    copy.normalizedAspectsMetaMap = new Map();
    copy.moduleAspectsMap = new Map();
    this.moduleAspectsMap.forEach((moduleAspect, decoratorId) => {
      const clonedAspect = moduleAspect.clone(moduleAspect.staticAspectOptions);
      copy.moduleAspectsMap.set(decoratorId, clonedAspect);
      const meta = clonedAspect.normalize(copy);
      if (meta) {
        copy.normalizedAspectsMetaMap.set(decoratorId, meta);
      }
    });
    copy.allModuleAspectsMap = new Map();
    this.allModuleAspectsMap.forEach((moduleAspect, decoratorId) => {
      const clonedAspect = (
        copy.moduleAspectsMap.has(decoratorId) ? copy.moduleAspectsMap.get(decoratorId) : moduleAspect.clone()
      ) as ModuleAspectHandler;
      copy.allModuleAspectsMap.set(decoratorId, clonedAspect);
      if (!copy.moduleAspectsMap.has(decoratorId)) {
        const meta = clonedAspect.normalize(copy);
        if (meta) {
          copy.normalizedAspectsMetaMap.set(decoratorId, meta);
        }
      }
    });

    return copy;
  }
}
