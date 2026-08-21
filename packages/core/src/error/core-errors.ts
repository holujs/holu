import { stringify } from '#di/stringify.js';
import { CustomError } from './custom-error.js';

/**
 * `Children map not found for ${moduleName}`
 */
export class MissingChildrenMap extends CustomError {
  constructor(moduleName: string | undefined) {
    super({ msg1: `Children map not found for ${moduleName}`, level: 'fatal' });
  }
}

/**
 * `Module metadata not found for ${moduleName}`
 */
export class MissingModuleMetadata extends CustomError {
  constructor(moduleName: string | undefined) {
    super({ msg1: `Module metadata not found for ${moduleName}`, level: 'fatal' });
  }
}

/**
 * `You are trying to use the useFactories() method from the "ProviderBuilder" helper,
 * but the [${i}] element has no decorators or is not a class.`
 */
export class ClassWithoutDecorators extends CustomError {
  constructor(i: number) {
    super({
      msg1:
        'You are trying to use the useFactories() method from the "ProviderBuilder" helper, ' +
        `but the [${i}] element has no decorators or is not a class.`,
      level: 'fatal',
    });
  }
}
/**
 * `Cannot reinit injector after stage1`
 */
export class ForbiddenInjectorReinit extends CustomError {
  constructor() {
    super({
      msg1: 'Cannot reinit injector after stage1',
      level: 'fatal',
    });
  }
}
/**
 * `Repeated saving of module metadata snapshots is prohibited. It is done only once—after their normalization.`
 */
export class ForbiddenSavingSnapshot extends CustomError {
  constructor() {
    super({
      msg1: 'Repeated saving of module metadata snapshots is prohibited. It is done only once - after their normalization.',
      level: 'warn',
    });
  }
}
/**
 * `Importing providers to ${moduleName} failed: exports ${fromModules}causes collision with ${namesStr}.
 * You should add ${tokenNames} to ${resolvedCollisionsPer} in this module.${example}`
 */
export class ProvidersCollision extends CustomError {
  constructor(moduleName: string, duplicates: any[], fromModuleNames: string[] = [], level?: string, isExternal?: boolean) {
    const tokens = duplicates.map((p) => p.name || p);
    const tokenNames = tokens.join(', ');
    let fromModules = 'from several modules ';
    let example = '';
    if (fromModuleNames.length) {
      fromModules = `from ${fromModuleNames.join(', ')} `;
      if (!level || level == 'App') {
        example = ` For example: resolvedCollisionsPerApp: [ [${tokens[0]}, ${fromModuleNames[0]}] ] in root module.`;
      } else {
        example = ` For example: resolvedCollisionsPer${level}: [ [${tokens[0]}, ${fromModuleNames[0]}] ].`;
      }
    }
    const resolvedCollisionsPer = level ? `resolvedCollisionsPer${level}` : 'resolvedCollisionsPer*';
    let msg1 = `Importing providers to ${moduleName} failed: exports ${fromModules}causes collision with ${tokenNames}. `;
    if (!isExternal) {
      msg1 += `You should add ${tokenNames} to ${resolvedCollisionsPer} in `;
      msg1 += !level || level == 'App' ? `root module.${example}` : `this module.${example}`;
    }
    super({
      msg1,
      level: 'fatal',
    });
  }
}
/**
 * `Resolving collisions for providersPer${level} in ${moduleName} failed: ${tokenName}
 * mapped with ${moduleName}, but providersPer${level} does not imports ${tokenName} in this module.`
 */
export class LevelCollisionNotImported extends CustomError {
  constructor(moduleName: string, level: string, tokenName: string) {
    super({
      msg1:
        `Resolving collisions for providersPer${level} in ${moduleName} failed: ` +
        `${tokenName} mapped with ${moduleName}, but ` +
        `providersPer${level} does not imports ${tokenName} in this module.`,
      level: 'fatal',
    });
  }
}
/**
 * `Resolving collisions for providersPer${level} in ${moduleName1} failed:
 * ${tokenName} mapped with ${moduleName2}, but ${tokenName} is a token of the multi providers,
 * and in this case it should not be included in resolvedCollisionsPer${level}.`
 */
export class LevelMultiProviderCollision extends CustomError {
  constructor(moduleName1: string, moduleName2: string, level: string, tokenName: string) {
    super({
      msg1:
        `Resolving collisions for providersPer${level} in ${moduleName1} failed: ` +
        `${tokenName} mapped with ${moduleName2}, but ${tokenName} is a token of the multi providers, ` +
        `and in this case it should not be included in resolvedCollisionsPer${level}.`,
      level: 'fatal',
    });
  }
}
/**
 * `Resolving collisions for providersPerApp in ${rootModuleName} failed:
 * ${tokenName} mapped with ${moduleName}, but ${tokenName} is a token of the multi providers,
 * and in this case it should not be included in resolvedCollisionsPerApp.`
 */
export class AppMultiProviderCollision extends CustomError {
  constructor(rootModuleName: string, moduleName: string, tokenName: string) {
    super({
      msg1:
        `Resolving collisions for providersPerApp in ${rootModuleName} failed: ` +
        `${tokenName} mapped with ${moduleName}, but ${tokenName} is a token of the multi providers, and in this case ` +
        'it should not be included in resolvedCollisionsPerApp.',
      level: 'fatal',
    });
  }
}
/**
 * `A configuration of extensions in ${moduleName}
 * creates a cyclic dependency in the startup sequence of different groups: ${strPath}.`
 */
export class ExtensionCyclicDependency extends CustomError {
  constructor(moduleName: string, strPath: string) {
    super({
      msg1:
        `A configuration of extensions in ${moduleName} ` +
        `creates a cyclic dependency in the startup sequence of different groups: ${strPath}.`,
      level: 'fatal',
    });
  }
}
/**
 * `Resolving collisions for providersPer${level} in ${moduleName1} failed:
 * ${tokenName} mapped with ${moduleName2}, but ${tokenName} does not exists in providersPer${level} of this module.`
 */
export class LevelCollisionNotFound extends CustomError {
  constructor(moduleName1: string, moduleName2: string, level: string, tokenName: string) {
    super({
      msg1:
        `Resolving collisions for providersPer${level} in ${moduleName1} failed: ${tokenName} mapped ` +
        `with ${moduleName2}, but ${tokenName} does not exists in providersPer${level} of this module.`,
      level: 'fatal',
    });
  }
}
/**
 * `Resolving collisions for providersPer${level} in ${moduleName1} failed: ${tokenName} mapped with
 * ${moduleName2}, but there are no collisions with ${tokenName} in the providersPer${level} array.`,
 */
export class InvalidCollisionResolution extends CustomError {
  constructor(moduleName1: string, moduleName2: string, level: string, tokenName: string) {
    super({
      msg1:
        `Resolving collisions for providersPer${level} in ${moduleName1} failed: ` +
        `${tokenName} mapped with ${moduleName2}, but there are no collisions ` +
        `with ${tokenName} in the providersPer${level} array.`,
      level: 'fatal',
    });
  }
}
/**
 * `Resolving collisions for providersPerApp in ${rootModuleName} failed:
 * ${tokenName} mapped with ${moduleName}, but providersPerApp does not includes ${tokenName} in this module.`
 */
export class AppProviderMissingToken extends CustomError {
  constructor(rootModuleName: string, moduleName: string, tokenName: string) {
    super({
      msg1:
        `Resolving collisions for providersPerApp in ${rootModuleName} failed: ` +
        `${tokenName} mapped with ${moduleName}, but providersPerApp does not includes ${tokenName} in this module.`,
      level: 'fatal',
    });
  }
}
/**
 * `Resolving collisions for providersPer${level} in ${moduleName1} failed:
 * ${tokenName} mapped with ${moduleName2}, but ${moduleName1} is not imported into the application.`
 */
export class AppCollisionNotFound extends CustomError {
  constructor(moduleName1: string, moduleName2: string, level: string, tokenName: string) {
    super({
      msg1:
        `Resolving collisions for providersPer${level} in ${moduleName1} failed: ` +
        `${tokenName} mapped with ${moduleName2}, but ${moduleName1} is not imported into the application.`,
      level: 'fatal',
    });
  }
}
/**
 * `this module should have "providersPerApp", or exports, or extensions.`
 */
export class MeaninglessModuleMetadata extends CustomError {
  constructor(moduleName: string) {
    super({
      msg1: `Normalization of ${moduleName} failed: this module should have "providersPerApp", or exports, or extensions.`,
      level: 'fatal',
    });
  }
}
/**
 * `Exported "${providerName}" includes in "providersPerApp" and "exports" of ${moduleName}.
 * This is an error, because "providersPerApp" is always exported automatically.`
 */
export class ForbiddenAppExport extends CustomError {
  constructor(moduleName: string, providerName: string) {
    super({
      msg1:
        `Exported "${providerName}" includes in "providersPerApp" and "exports" of ${moduleName}. ` +
        'This is an error, because "providersPerApp" is always exported automatically.',
      level: 'fatal',
    });
  }
}
/**
 * `Exporting "${providerName}" from "${moduleName}" failed: in "exports" array must be includes tokens only.`
 */
export class ForbiddenNormalizedExport extends CustomError {
  constructor(moduleName: string, providerName: string) {
    super({
      msg1: `Exporting "${providerName}" from "${moduleName}" failed: in "exports" array must be includes tokens only.`,
      level: 'fatal',
    });
  }
}
/**
 * `Exporting from ${moduleName} failed: if "${tokenName}" is a token of a provider, this provider
 * must be included in one of providersPer* array. If "${tokenName}" is a module, it must have "featureModule" decorator.`
 */
export class UnknownExport extends CustomError {
  constructor(moduleName: string, tokenName: string) {
    super({
      msg1:
        `Exporting "${tokenName}" from ${moduleName} failed: if "${tokenName}" is a token of a provider, this provider ` +
        'must be included in one of providersPer* array. ' +
        `If "${tokenName}" is a module, it must have "featureModule" decorator.`,
      level: 'fatal',
    });
  }
}
/**
 * `Exporting "${tokenName}" from "${moduleName}" failed: all extensions must have stage1() or stage2(), or stage3() method.`
 */
export class InvalidExtension extends CustomError {
  constructor(moduleName: string, tokenName: string) {
    super({
      msg1: `Exporting "${tokenName}" from "${moduleName}" failed: all extensions must have stage1() or stage2(), or stage3() method.`,
      level: 'fatal',
    });
  }
}
/**
 * `Reexport from ${moduleName} failed: ${importedModuleName} includes in exports,
 * but not includes in imports. If in ${moduleName} you imports ${importedModuleName} as
 * module with params, same object you should export (if you need reexport).`
 */
export class ReexportFailure extends CustomError {
  constructor(moduleName: string, importedModuleName: string) {
    super({
      msg1:
        `Reexport from ${moduleName} failed: ${importedModuleName} includes in exports, ` +
        `but not includes in imports. If in ${moduleName} you imports ${importedModuleName} as ` +
        'module with params, same object you should export (if you need reexport).',
      level: 'fatal',
    });
  }
}
/**
 * `${action} into "${moduleName}" failed: element at ${lowerAction}[${i}] has "undefined" type.
 * This can be caused by circular dependency. Try to replace this element with this expression:
 * "forwardRef(() => YourModule)".`
 */
export class UndefinedSymbol extends CustomError {
  constructor(action: 'Static exports' | 'Dynamic exports' | 'Imports', moduleName: string, i: number) {
    const lowerAction = action.toLowerCase();
    super({
      msg1:
        `${action} into "${moduleName}" failed: element at ${lowerAction}[${i}] has "undefined" type. ` +
        'This can be caused by circular dependency. Try to replace this element with this expression: ' +
        '"forwardRef(() => YourModule)".',
      level: 'fatal',
    });
  }
}
/**
 * `Resolving collisions in ${moduleName} failed: for ${providerName} inside
 * "resolvedCollisionsPer*" array must be includes tokens only.`
 */
export class ResolvedCollisionTokensOnly extends CustomError {
  constructor(moduleName: string, providerName: string) {
    super({
      msg1:
        `Resolving collisions in ${moduleName} failed: for ${providerName} inside ` +
        '"resolvedCollisionsPer*" array must be includes tokens only.',
      level: 'fatal',
    });
  }
}
/**
 * `module "${modName}" does not have the "@rootModule()" or "@featureModule()" decorator`
 */
export class MissingModuleDecorator extends CustomError {
  constructor(modName: string) {
    super({
      msg1: `module "${modName}" does not have the "@rootModule()" or "@featureModule()" decorator`,
      level: 'fatal',
    });
  }
}
/**
 * `The passed argument - modRefId - is not a class, and is not a module with a parameter.`
 */
export class InvalidModRefId extends CustomError {
  constructor() {
    super({
      msg1: 'The passed argument - modRefId - is not a class, and is not a module with a parameter.',
      level: 'fatal',
    });
  }
}
/**
 * `Detected circular dependencies: ${circularNames}.`
 */
export class CyclicImports extends CustomError {
  constructor(circularNames: string, prefixNames?: string) {
    let msg1 = `Detected circular dependencies: ${circularNames}.`;
    if (prefixNames) {
      msg1 += ` It is started from ${prefixNames}.`;
    }
    super({
      msg1,
      level: 'fatal',
    });
  }
}
/**
 * `Initialization failed in ${debugModuleName} -> ${extensionName} at stage 3`
 */
export class Stage3InitFailure extends CustomError {
  constructor(debugModuleName: string, extensionName: string, cause: any) {
    super(
      {
        msg1: `Initialization failed in ${debugModuleName} -> ${extensionName} at stage 3`,
        level: 'fatal',
      },
      cause,
    );
  }
}
/**
 * `Initialization in ${debugModuleName} -> ${ext.constructor.name} at stage 2 failed`
 */
export class Stage2InitFailure extends CustomError {
  constructor(debugModuleName: string, extensionName: string, cause: any) {
    super(
      {
        msg1: `Initialization in ${debugModuleName} -> ${extensionName} at stage 2 failed`,
        level: 'fatal',
      },
      cause,
    );
  }
}
/**
 * `Failed create injector per module for ${debugModuleName}`
 */
export class ModuleInjectorCreationFailure extends CustomError {
  constructor(debugModuleName: string, cause: any) {
    super(
      {
        msg1: `Failed create injector per module for ${debugModuleName}`,
        level: 'fatal',
      },
      cause,
    );
  }
}
/**
 * `Failed override metadata after stage1 for ${debugModuleName}`
 */
export class MetaOverrideFailure extends CustomError {
  constructor(debugModuleName: string, cause: any) {
    super(
      {
        msg1: `Failed override metadata after stage1 for ${debugModuleName}`,
        level: 'fatal',
      },
      cause,
    );
  }
}
/**
 * `Metadata collection from all modules for ${groupName} failed`
 */
export class MetadataCollectionFailure extends CustomError {
  constructor(groupName: string, cause: any) {
    super(
      {
        msg1: `Metadata collection from all modules for ${groupName} failed`,
        level: 'fatal',
      },
      cause,
    );
  }
}
/**
 * `Resolving collisions for providersPerApp in ${rootModuleName} failed:
 * ${tokenName} mapped with ${moduleName}, but ${moduleName} is not imported into the application.`
 */
export class ModuleNotImported extends CustomError {
  constructor(rootModuleName: string, moduleName: string, tokenName: string) {
    super({
      msg1:
        `Resolving collisions for providersPerApp in ${rootModuleName} failed: ` +
        `${tokenName} mapped with ${moduleName}, but ${moduleName} is not imported into the application.`,
      level: 'fatal',
    });
  }
}
/**
 * The logger was not previously seted.
 */
export class LoggerNotSet extends CustomError {
  constructor() {
    super({
      msg1: 'The logger was not previously seted.',
      level: 'warn',
    });
  }
}
/**
 * `${ExtCls.name} is failed`
 */
export class ExtensionExecutionFailure extends CustomError {
  constructor(extensionName: string, moduleName: string, cause: Error) {
    super(
      {
        msg1: `${extensionName} in ${moduleName} is failed`,
        level: 'fatal',
      },
      cause,
    );
  }
}
/**
 * `Detected circular dependencies: ${circularNames}.`
 */
export class CyclicExtensions extends CustomError {
  constructor(circularNames: string, prefixNames?: string) {
    let msg1 = `Detected circular dependencies: ${circularNames}.`;
    if (prefixNames) {
      msg1 += ` It is started from ${prefixNames}.`;
    }
    super({
      msg1,
      level: 'fatal',
    });
  }
}
/**
 * `extensionName1 attempted to call "extensionManager.stage1(extensionName2)",
 * but extensionName2 not declared in "afterExtensions" array in this module.`
 */
export class UndeclaredExtensionDependency extends CustomError {
  constructor(extensionName1: string, extensionName2: string) {
    super({
      msg1:
        `${extensionName1} attempted to call "extensionManager.stage1(${extensionName2})", ` +
        `but ${extensionName2} not declared in "afterExtensions" array in this extension.`,
      level: 'fatal',
    });
  }
}
/**
 * `Failed to import providers for ${moduleName}`
 */
export class ProviderImportFailure extends CustomError {
  constructor(moduleName: string, cause: any) {
    super(
      {
        msg1: `Failed to import providers for ${moduleName}`,
        level: 'fatal',
      },
      cause,
    );
  }
}
/**
 * `Dependency resolution failed in ${moduleName}: no provider for ${tokenName}! ${partMsg}.`
 */
export class NoProviderDuringImportResolution extends CustomError {
  constructor(moduleName: string, tokenName: string, partMsg: string) {
    super({
      msg1: `Dependency resolution failed in ${moduleName}: no provider for ${stringify(tokenName)}! ${partMsg}.`,
      level: 'fatal',
    });
  }
}
/**
 * `Module scaning failed: "${rootModuleName}" does not have the "@rootModule()" decorator`.
 */
export class MissingRootDecorator extends CustomError {
  constructor(rootModuleName: string) {
    super({
      msg1: `Module scaning failed: "${rootModuleName}" does not have the "@rootModule()" decorator.`,
      level: 'fatal',
    });
  }
}
/**
 * `Failed adding ${modName} to imports: target module with ID "${modIdStr}" not found.`
 */
export class ImportAdditionFailure extends CustomError {
  constructor(modName?: string, modIdStr?: string) {
    super({
      msg1: `Failed adding ${modName} to imports: target module with ID "${modIdStr}" not found.`,
      level: 'warn',
    });
  }
}
/**
 * `Failed removing ${inputMeta.name} from "imports" array: target module with ID "${modIdStr}" not found.`
 */
export class ImportRemovalFailure extends CustomError {
  constructor(inputModName: string, modIdStr: string) {
    super({
      msg1: `Failed removing ${inputModName} from "imports" array: target module with ID "${modIdStr}" not found.`,
      level: 'warn',
    });
  }
}
/**
 * 'It is forbidden for rollback() to an empty state.'
 */
export class ForbiddenRollback extends CustomError {
  constructor() {
    super({
      msg1: 'It is forbidden for rollback() to an empty state.',
      level: 'warn',
    });
  }
}
/**
 * `${moduleId} not found in ModuleRegistry.`
 */
export class ModuleIdNotFound extends CustomError {
  constructor(moduleId: string) {
    super({
      msg1: `${moduleId} not found in ModuleRegistry.`,
      level: 'warn',
    });
  }
}
/**
 * `Normalization of ${moduleName} failed`
 */
export class NormalizationFailure extends CustomError {
  constructor(moduleName: string, cause: Error) {
    super(
      {
        msg1: `Normalization of ${moduleName} failed`,
        level: 'fatal',
      },
      cause,
    );
  }
}
/**
 * 'Runtime module modification is disabled. To enable it, set "allowRuntimeReinit: true" in ApplicationOptions.'
 */
export class RuntimeReinitDisabled extends CustomError {
  constructor() {
    super({
      msg1: 'Runtime module modification is disabled. To enable it, set "allowRuntimeReinit: true" in ApplicationOptions.',
      level: 'warn',
    });
  }
}

/**
 * `${prop} is reserved for internal use by NormalizedModuleMeta. You cannot use ${aspectMetaClassName}.${prop}.`
 */
export class ReservedMetaProp extends CustomError {
  constructor(prop: string, aspectMetaClassName: string) {
    super({
      msg1: `${prop} is reserved for internal use by NormalizedModuleMeta. You cannot use ${aspectMetaClassName}.${prop}.`,
      level: 'fatal',
    });
  }
}
