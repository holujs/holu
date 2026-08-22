import type { ModuleId } from '#init/module-registry.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { StaticModule } from '#decorators/module-decorator-options.js';
import type { ModuleGraph } from '#init/module-graph.js';
import { isDynamicModule } from '#decorators/type-guards.js';
import { ModuleRegistry } from '#init/module-registry.js';
import { format } from 'node:util';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import { ImportAdditionFailure, ImportRemovalFailure, ForbiddenRollback } from '#errors';

/**
 * @experimental The mutability of the module graph is an experimental feature.
 *
 * Extends `ModuleRegistry` to support dynamic addition and removal of module imports
 * at runtime. Modifying the module graph is done transactionally.
 */
export class MutableModuleRegistry extends ModuleRegistry {
  protected oldGraph?: ModuleGraph;

  override scanRootModule(appModule: StaticModule): NormalizedModuleMeta {
    if (this.moduleGraph.normalizedMetaMap.size) {
      this.systemLogMediator.forbiddenRescanRootModule(this);
      return this.getNormalizedModuleMeta('root', true);
    }
    return super.scanRootModule(appModule);
  }

  /**
   * @experimental The mutability of the module graph is an experimental feature.
   *
   * Dynamically adds a module import to a specified target module.
   */
  addImport(inputModule: ModRefId, targetModuleId: ModuleId = 'root'): boolean | void {
    const targetNormalizedModuleMeta = this.getNormalizedModuleMeta(targetModuleId);
    if (!targetNormalizedModuleMeta) {
      const modName = getDebugClassName(inputModule);
      const modIdStr = format(targetModuleId).slice(0, 50);
      throw new ImportAdditionFailure(modName, modIdStr);
    }

    const prop = isDynamicModule(inputModule) ? 'importedDynamicModules' : 'importedStaticModules';
    if (targetNormalizedModuleMeta[prop].some((imp: ModRefId) => imp === inputModule)) {
      const modIdStr = format(targetModuleId).slice(0, 50);
      this.systemLogMediator.moduleAlreadyImported(this, inputModule, modIdStr);
      return false;
    }

    this.startTransaction();
    try {
      (targetNormalizedModuleMeta[prop] as ModRefId[]).push(inputModule);
      this.moduleGraph.addChild(targetNormalizedModuleMeta.modRefId, inputModule);

      this.scanModule(inputModule);
      this.propagateAspectsAndValidate(inputModule);
      this.systemLogMediator.successfulAddedModuleToImport(this, inputModule, targetNormalizedModuleMeta.name);
      return true;
    } catch (err) {
      this.rollback(err as Error);
    }
  }

  /**
   * @experimental The mutability of the module graph is an experimental feature.
   *
   * Dynamically removes a module import from a specified target module.
   */
  removeImport(inputModuleId: ModuleId, targetModuleId: ModuleId = 'root'): boolean | void {
    const inputNormalizedModuleMeta = this.getNormalizedModuleMeta(inputModuleId);
    if (!inputNormalizedModuleMeta) {
      const modIdStr = format(inputModuleId).slice(0, 50);
      this.systemLogMediator.moduleNotFound(this, modIdStr);
      return false;
    }

    const targetMeta = this.getNormalizedModuleMeta(targetModuleId);
    if (!targetMeta) {
      const modIdStr = format(targetModuleId).slice(0, 50);
      throw new ImportRemovalFailure(inputNormalizedModuleMeta.name, modIdStr);
    }
    const prop = isDynamicModule(inputNormalizedModuleMeta.modRefId) ? 'importedDynamicModules' : 'importedStaticModules';
    const index = targetMeta[prop].findIndex((imp: ModRefId) => imp === inputNormalizedModuleMeta.modRefId);
    if (index == -1) {
      const modIdStr = format(inputModuleId).slice(0, 50);
      this.systemLogMediator.moduleNotFound(this, modIdStr);
      return false;
    }

    this.startTransaction();
    try {
      targetMeta[prop].splice(index, 1);
      this.moduleGraph.removeChild(targetMeta.modRefId, inputNormalizedModuleMeta.modRefId);
      this.moduleGraph.pruneUnreachableModules();
      this.systemLogMediator.moduleSuccessfulRemoved(this, inputNormalizedModuleMeta.name, targetMeta.name);
      return true;
    } catch (err) {
      this.rollback(err as Error);
    }
  }

  /**
   * @experimental The mutability of the module graph is an experimental feature.
   */
  startTransaction() {
    if (this.oldGraph) {
      return false;
    }
    this.oldGraph = this.moduleGraph.clone();
    return true;
  }

  /**
   * @experimental The mutability of the module graph is an experimental feature.
   */
  rollback(err?: Error) {
    if (!this.oldGraph) {
      throw new ForbiddenRollback();
    }
    this.moduleGraph = this.oldGraph;
    this.commit();
    if (err) {
      throw err;
    }
    return this;
  }

  /**
   * @experimental The mutability of the module graph is an experimental feature.
   */
  commit() {
    this.oldGraph = undefined;
    return this;
  }
}
