import { DecoratorMeta } from '#di/top/decorator-and-value.js';
import type { AnyObj, RequireProps } from '#types/mix.js';
import type { DynamicModule } from '#decorators/module-decorator-options.js';
import { FeatureModuleOptions } from '#decorators/module-decorator-options.js';
import { ModuleAspectHandler } from '#decorators/module-aspects.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import { RootModuleOptions } from './root-module.js';
import { Reflector } from '#di/reflector.js';

function checkModuleRole(arg: any, expectedRole: 'root' | 'feature', ExpectedClass: any): boolean {
  if (arg instanceof DecoratorMeta) {
    if (arg.value instanceof ModuleAspectHandler) {
      return arg.value.moduleRole === expectedRole;
    }
    return arg.value instanceof ExpectedClass;
  } else if (arg instanceof NormalizedModuleMeta) {
    if (arg.staticModuleOptions instanceof ModuleAspectHandler) {
      return arg.staticModuleOptions.moduleRole === expectedRole;
    }
    return arg.staticModuleOptions instanceof ExpectedClass;
  } else if (arg instanceof ModuleAspectHandler) {
    return arg.moduleRole === expectedRole;
  }
  const decoratorMeta = Reflector.getClassLevelMeta(arg);
  if (decoratorMeta) {
    return decoratorMeta.some(m => checkModuleRole(m, expectedRole, ExpectedClass));
  }
  return arg instanceof ExpectedClass;
}

export function isRootModule(decorMeta?: DecoratorMeta): decorMeta is DecoratorMeta<RootModuleOptions>;
export function isRootModule(
  normalizedModuleMeta?: NormalizedModuleMeta,
): normalizedModuleMeta is NormalizedModuleMeta<RootModuleOptions>;
export function isRootModule(moduleOptions?: AnyObj): moduleOptions is RootModuleOptions;
export function isRootModule(arg?: any): boolean {
  return checkModuleRole(arg, 'root', RootModuleOptions);
}

export function isFeatureModule(arg?: DecoratorMeta): arg is DecoratorMeta<FeatureModuleOptions>;
export function isFeatureModule(
  normalizedModuleMeta?: NormalizedModuleMeta,
): normalizedModuleMeta is NormalizedModuleMeta<FeatureModuleOptions>;
export function isFeatureModule(arg?: AnyObj): arg is FeatureModuleOptions;
export function isFeatureModule(arg?: any): boolean {
  return checkModuleRole(arg, 'feature', FeatureModuleOptions);
}

export function isModuleDecorator(arg?: DecoratorMeta): arg is DecoratorMeta<RootModuleOptions | FeatureModuleOptions>;
export function isModuleDecorator(arg?: RootModuleOptions): arg is RootModuleOptions | FeatureModuleOptions;
export function isModuleDecorator(arg?: any) {
  return isRootModule(arg) || isFeatureModule(arg);
}

export function isModuleWithModuleAspect(metadata?: ModuleAspectHandler<AnyObj>): metadata is ModuleAspectHandler<AnyObj>;
export function isModuleWithModuleAspect(arg?: DecoratorMeta): arg is Required<DecoratorMeta<ModuleAspectHandler<AnyObj>>>;
export function isModuleWithModuleAspect(arg?: any): boolean {
  if (arg instanceof DecoratorMeta) {
    return arg.value instanceof ModuleAspectHandler;
  } else {
    return arg instanceof ModuleAspectHandler;
  }
}

/**
 * If this guard returns `true`, then the `DecoratorMeta`
 * instance passed to it has the `declaredInDir` property set.
 */
export function hasDeclaredInDir(decoratorMeta?: DecoratorMeta): decoratorMeta is RequireProps<DecoratorMeta, 'declaredInDir'> {
  return Boolean(decoratorMeta?.declaredInDir) && decoratorMeta?.declaredInDir != '.';
}

export function isDynamicModule(modRefId?: any): modRefId is DynamicModule {
  return modRefId?.module !== undefined;
}

export function isDynamicModuleWrapper(arg?: any): arg is { dynamicModule: DynamicModule } {
  return isDynamicModule(arg?.dynamicModule);
}
