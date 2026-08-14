import { format } from 'node:util';
import type { Provider } from '#di/top/types-and-models.js';

import type { ModuleId } from '#init/module-manager.js';
import { ModuleManager } from '#init/module-manager.js';
import { ModuleGraphState } from '#init/module-graph-state.js';
import type { NormalizedModuleMeta } from '#init/normalized-meta.js';
import type { ModRefId, StaticModule } from '#decorators/module-decorator-options.js';
import { isDynamicModule } from '#decorators/type-guards.js';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import {
  ImportAdditionFailure,
  ImportRemovalFailure,
  ForbiddenRollback,
  ForbiddenSavingSnapshot,
  NormalizationFailure,
} from '#errors';

/**
 * @experimental The mutability of the module graph is an experimental feature.
 *
 * Extends `ModuleManager` to support dynamic addition and removal of module imports
 * at runtime. Modifying the module graph is done transactionally.
 */
export class MutableModuleManager extends ModuleManager {
  protected state = new ModuleGraphState();
  protected oldState?: ModuleGraphState;

  protected override get childrenMap() {
    return this.state.childrenMap;
  }

  protected override set childrenMap(val: Map<ModRefId, Set<ModRefId>>) {
    this.state.childrenMap = val;
  }

  override get providersPerApp() {
    return this.state.providersPerApp;
  }

  protected override set providersPerApp(val: Provider[]) {
    this.state.providersPerApp = val;
  }

  override scanRootModule(appModule: StaticModule): NormalizedModuleMeta {
    if (this.state.snapshotMap.size) {
      this.systemLogMediator.forbiddenRescanRootModule(this);
      return this.getNormalizedModuleMeta('root', true);
    }
    const meta = super.scanRootModule(appModule);
    this.saveSnapshot();
    return meta;
  }

  protected override setNormalizedModuleMeta(modRefId: ModRefId, normalizedModuleMeta: NormalizedModuleMeta) {
    if (this.oldState) {
      this.state.snapshotMap.set(modRefId, normalizedModuleMeta);
    } else {
      this.normalizedMetaMap.set(modRefId, normalizedModuleMeta);
    }
  }

  /**
   * @experimental The mutability of the module graph is an experimental feature.
   *
   * Dynamically adds a module import to a specified target module.
   */
  addImport(inputModule: ModRefId, targetModuleId: ModuleId = 'root'): boolean | void {
    const targetNormalizedModuleMeta = this.getNormalizedModuleMetaFromSnapshot(targetModuleId);
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
      let children = this.state.childrenMap.get(targetNormalizedModuleMeta.modRefId);
      if (!children) {
        children = new Set();
        this.state.childrenMap.set(targetNormalizedModuleMeta.modRefId, children);
      }
      children.add(inputModule);

      this.scanModule(inputModule);
      this.finalizeRootScan(inputModule);
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
    const inputNormalizedModuleMeta = this.getNormalizedModuleMetaFromSnapshot(inputModuleId);
    if (!inputNormalizedModuleMeta) {
      const modIdStr = format(inputModuleId).slice(0, 50);
      this.systemLogMediator.moduleNotFound(this, modIdStr);
      return false;
    }

    const targetMeta = this.getNormalizedModuleMetaFromSnapshot(targetModuleId);
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
      const targetChildren = this.state.childrenMap.get(targetMeta.modRefId);
      if (targetChildren) {
        targetChildren.delete(inputNormalizedModuleMeta.modRefId);
      }
      if (!this.includesInSomeModule(inputModuleId, 'root')) {
        this.state.removeOrphanModule(inputNormalizedModuleMeta.modRefId, inputNormalizedModuleMeta.id);
      }
      this.systemLogMediator.moduleSuccessfulRemoved(this, inputNormalizedModuleMeta.name, targetMeta.name);
      return true;
    } catch (err) {
      this.rollback(err as Error);
    }
  }

  protected override get activeMetaMap() {
    return this.oldState ? this.state.snapshotMap : this.normalizedMetaMap;
  }


  /**
   * @experimental The mutability of the module graph is an experimental feature.
   */
  startTransaction() {
    if (this.oldState) {
      return false;
    }
    this.oldState = this.state.clone();
    return true;
  }

  /**
   * @experimental The mutability of the module graph is an experimental feature.
   */
  rollback(err?: Error) {
    if (!this.oldState) {
      throw new ForbiddenRollback();
    }
    this.state = this.oldState;
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
    this.oldState = undefined;
    return this;
  }

  /**
   * @experimental The mutability of the module graph is an experimental feature.
   */
  reset() {
    this.normalizedMetaMap = new Map();
    this.state.snapshotMap.forEach((normalizedModuleMeta, key) => this.normalizedMetaMap.set(key, normalizedModuleMeta.clone()));
    this.moduleIdMap = new Map(this.state.snapshotMapId);
    return this;
  }

  protected getNormalizedModuleMetaFromSnapshot(moduleId: ModuleId) {
    let normalizedModuleMeta: NormalizedModuleMeta | undefined;
    if (typeof moduleId == 'string') {
      const mapId = this.state.snapshotMapId.get(moduleId);
      if (mapId) {
        normalizedModuleMeta = this.state.snapshotMap.get(mapId);
      }
    } else {
      normalizedModuleMeta = this.state.snapshotMap.get(moduleId);
    }
    return normalizedModuleMeta;
  }

  protected rebuildProvidersPerAppFromSnapshot() {
    this.state.rebuildProvidersPerApp();
  }

  protected includesInSomeModule(inputModuleId: ModuleId, targetModuleId: ModuleId, visited = new Set<ModuleId>()): boolean {
    if (visited.has(targetModuleId)) {
      return false;
    }
    visited.add(targetModuleId);

    const targetMeta = this.getNormalizedModuleMetaFromSnapshot(targetModuleId);
    if (!targetMeta) {
      return false;
    }
    if (targetMeta.modRefId !== targetModuleId) {
      if (visited.has(targetMeta.modRefId)) {
        return false;
      }
      visited.add(targetMeta.modRefId);
    }

    const targetModRefId = targetMeta.modRefId;
    const children = this.state.childrenMap.get(targetModRefId);
    if (!children || children.size === 0) {
      return false;
    }

    const resolvedInputId =
      typeof inputModuleId === 'string' ? this.state.snapshotMapId.get(inputModuleId) || inputModuleId : inputModuleId;

    if (children.has(resolvedInputId as ModRefId)) {
      return true;
    }

    for (const child of children) {
      if (this.includesInSomeModule(resolvedInputId, child, visited)) {
        return true;
      }
    }

    return false;
  }

  protected saveSnapshot() {
    if (this.state.snapshotMap.size) {
      throw new ForbiddenSavingSnapshot();
    } else {
      this.normalizedMetaMap.forEach((normalizedModuleMeta, modRefId) =>
        this.state.snapshotMap.set(modRefId, normalizedModuleMeta.clone()),
      );
      this.state.snapshotMapId = new Map(this.moduleIdMap);
    }
  }

  protected override getMeta(modRefId: ModRefId): NormalizedModuleMeta | undefined {
    return this.normalizedMetaMap.get(modRefId) || this.state.snapshotMap.get(modRefId);
  }

  protected override checkEmptyMetaForAllModules() {
    super.checkEmptyMetaForAllModules();
    this.state.snapshotMap.forEach((meta) => {
      try {
        this.aspectApplier.checkEmptyMeta(meta);
      } catch (err: any) {
        throw new NormalizationFailure(meta.name, err);
      }
    });
  }
}
