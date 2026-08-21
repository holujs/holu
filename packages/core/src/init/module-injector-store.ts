import type { Injector } from '#di/injector.js';
import type { ModRefId } from '#decorators/module-decorator-options.js';
import type { AnyObj } from '#types/mix.js';
import { ModuleIdNotFound } from '#errors';
import { getDebugClassName } from '#utils/get-debug-class-name.js';
import { getModule } from '#utils/get-module.js';

export type ModuleId = string | ModRefId;

export class ModuleInjectorStore {
  protected injectorPerModMap = new Map<ModRefId, Injector>();

  constructor(
    protected moduleIdMapSource: ReadonlyMap<'root' | (string & {}), ModRefId> | (() => ReadonlyMap<'root' | (string & {}), ModRefId>),
  ) {}

  protected get moduleIdMap() {
    return typeof this.moduleIdMapSource == 'function' ? this.moduleIdMapSource() : this.moduleIdMapSource;
  }

  /**
   * Returns the internal registry mapping module reference IDs (`ModRefId`) to their instantiated module-level injectors.
   */
  get injectorsPerMod(): ReadonlyMap<ModRefId, Injector> {
    return this.injectorPerModMap;
  }

  clear() {
    this.injectorPerModMap.clear();
  }

  /**
   * Registers an instantiated module-level DI {@link Injector} for the specified module reference or ID.
   */
  setInjectorPerMod(moduleId: ModuleId, injectorPerMod: Injector) {
    if (typeof moduleId == 'string') {
      const modRefId = this.moduleIdMap.get(moduleId);
      if (modRefId) {
        this.injectorPerModMap.set(modRefId, injectorPerMod);
      } else {
        throw new ModuleIdNotFound(moduleId);
      }
    } else {
      this.injectorPerModMap.set(moduleId, injectorPerMod);
    }
  }

  /**
   * Retrieves the module-level DI {@link Injector} associated with the given module ID or reference.
   */
  getInjectorPerMod(moduleId: ModuleId, throwErrIfNotFound: true): Injector;
  getInjectorPerMod(moduleId: ModuleId, throwErrIfNotFound?: false): Injector | undefined;
  getInjectorPerMod(moduleId: ModuleId, throwErrIfNotFound?: boolean): Injector | undefined {
    let inj: Injector | undefined;
    if (typeof moduleId == 'string') {
      const modRefId = this.moduleIdMap.get(moduleId);
      if (modRefId) {
        inj = this.injectorPerModMap.get(modRefId);
      }
    } else {
      inj = this.injectorPerModMap.get(moduleId);
    }

    if (!inj && throwErrIfNotFound) {
      const moduleName = getDebugClassName(moduleId) || 'unknown';
      throw new ModuleIdNotFound(moduleName);
    }
    return inj;
  }

  /**
   * Retrieves the instantiated singleton class instance of a module from its corresponding module-level injector.
   */
  getInstanceOf<T extends AnyObj>(modRefId: ModRefId<T>, throwErrIfNotFound: true): T;
  getInstanceOf<T extends AnyObj>(modRefId: ModRefId<T>, throwErrIfNotFound?: false): T | undefined;
  getInstanceOf(moduleId: ModuleId, throwErrIfNotFound: true): AnyObj;
  getInstanceOf(moduleId: ModuleId, throwErrIfNotFound?: false): AnyObj | undefined;
  getInstanceOf(moduleId: ModuleId, throwErrIfNotFound?: boolean) {
    const modRefId = typeof moduleId == 'string' ? this.moduleIdMap.get(moduleId) : moduleId;
    if (!modRefId) {
      if (throwErrIfNotFound === true) {
        throw new ModuleIdNotFound(moduleId as string);
      }
      return undefined;
    }
    const Mod = getModule(modRefId);
    if (throwErrIfNotFound === true) {
      return this.getInjectorPerMod(modRefId, true).get(Mod);
    }
    return this.getInjectorPerMod(modRefId, throwErrIfNotFound)?.get(Mod);
  }
}
