import { Reflector } from '#di/reflector.js';
import { DecoratorMeta } from '#di/top/decorator-and-value.js';
import { featureModule } from '#decorators/feature-module.js';
import { rootModule, RootModuleOptions } from '#decorators/root-module.js';
import { FeatureModuleOptions, DynamicModule } from '#decorators/module-decorator-options.js';
import { ModuleAspectHandler } from '#decorators/module-aspects.js';
import { NormalizedModuleMeta } from '#init/normalized-meta.js';
import {
  isFeatureModule,
  isDynamicModule,
  isRootModule,
  isDynamicModuleWrapper,
  isModuleDecorator,
  isModuleWithModuleAspect,
  hasDeclaredInDir,
} from '#decorators/type-guards.js';

describe('type guards', () => {
  describe('isDynamicModuleWrapper()', () => {
    it('returns true when dynamicModule property is a DynamicModule', () => {
      class Module1 {}
      const wrapper = { dynamicModule: { module: Module1 } };
      expect(isDynamicModuleWrapper(wrapper)).toBe(true);
    });

    it('returns false when dynamicModule property is invalid or an empty object', () => {
      const wrapper = { dynamicModule: {} as DynamicModule };
      expect(isDynamicModuleWrapper(wrapper)).toBe(false);
    });

    it('returns false for empty object or undefined', () => {
      expect(isDynamicModuleWrapper({})).toBe(false);
      expect(isDynamicModuleWrapper()).toBe(false);
    });
  });

  describe('isFeatureModule()', () => {
    it('returns false for class metadata without module decorator', () => {
      class Module1 {}
      const metadata = Reflector.collectMeta(Module1);
      expect(isFeatureModule(metadata)).toBe(false);
    });

    it('returns true for a class with featureModule decorator', () => {
      @featureModule()
      class Module1 {}
      // Passing the class directly
      expect(isFeatureModule(Module1)).toBe(true);
    });

    it('returns true for DecoratorMeta with featureModule', () => {
      @featureModule()
      class Module1 {}
      const metadata = Reflector.getClassLevelMeta(Module1)![0];
      expect(isFeatureModule(metadata)).toBe(true);
    });

    it('returns false for DecoratorMeta with ModuleAspectHandler when moduleRole is not feature', () => {
      const moduleAspect = new ModuleAspectHandler({});
      const decorMeta = new DecoratorMeta(featureModule, moduleAspect);
      expect(isFeatureModule(decorMeta)).toBe(false);
    });

    it('returns true for DecoratorMeta with ModuleAspectHandler when moduleRole is feature', () => {
      const moduleAspect = new ModuleAspectHandler({});
      moduleAspect.moduleRole = 'feature';
      const decorMeta = new DecoratorMeta(featureModule, moduleAspect);
      expect(isFeatureModule(decorMeta)).toBe(true);
    });

    it('returns true for NormalizedModuleMeta with FeatureModuleOptions', () => {
      @featureModule()
      class Module1 {
        method1() {}
      }

      const normalizedModuleMeta = new NormalizedModuleMeta();
      const metadata = Reflector.getClassLevelMeta(Module1)![0];
      normalizedModuleMeta.staticModuleOptions = metadata.value;
      expect(isFeatureModule(normalizedModuleMeta)).toBe(true);
    });

    it('returns false for NormalizedModuleMeta with empty staticAspectOptions', () => {
      const normalizedModuleMeta = new NormalizedModuleMeta();
      normalizedModuleMeta.staticModuleOptions = {};
      expect(isFeatureModule(normalizedModuleMeta)).toBe(false);
    });

    it('returns false for NormalizedModuleMeta with ModuleAspectHandler when moduleRole is not feature', () => {
      const moduleAspect = new ModuleAspectHandler({});
      const normalizedModuleMeta = new NormalizedModuleMeta();
      normalizedModuleMeta.staticModuleOptions = moduleAspect.staticAspectOptions;
      expect(isFeatureModule(normalizedModuleMeta)).toBe(false);
    });

    it('returns true for NormalizedModuleMeta with ModuleAspectHandler when moduleRole is feature', () => {
      const moduleAspect = new ModuleAspectHandler({});
      moduleAspect.moduleRole = 'feature';
      const normalizedModuleMeta = new NormalizedModuleMeta();
      normalizedModuleMeta.staticModuleOptions = moduleAspect.staticAspectOptions;
      expect(isFeatureModule(normalizedModuleMeta)).toBe(true);
    });

    it('returns true for direct ModuleAspectHandler instance when moduleRole is feature', () => {
      const moduleAspect = new ModuleAspectHandler({});
      moduleAspect.moduleRole = 'feature';
      expect(isFeatureModule(moduleAspect)).toBe(true);
    });

    it('returns false for direct ModuleAspectHandler instance when moduleRole is not feature', () => {
      const moduleAspect = new ModuleAspectHandler({});
      expect(isFeatureModule(moduleAspect)).toBe(false);
    });

    it('returns true for FeatureModuleOptions instance', () => {
      expect(isFeatureModule(new FeatureModuleOptions())).toBe(true);
    });
  });

  describe('isRootModule()', () => {
    it('returns module options when collecting class level metadata', () => {
      @rootModule({})
      class Module1 {}
      const moduleOptions = Reflector.getClassLevelMeta(Module1, isRootModule);
      expect(moduleOptions).toBeDefined();
    });

    it('returns false for class metadata without module decorator', () => {
      class Module1 {}
      const metadata = Reflector.collectMeta(Module1);
      expect(isRootModule(metadata)).toBe(false);
    });

    it('returns true for a class with rootModule decorator', () => {
      @rootModule({})
      class Module1 {}
      // Passing the class directly
      expect(isRootModule(Module1)).toBe(true);
    });

    it('returns true for DecoratorMeta with rootModule', () => {
      @rootModule({})
      class Module1 {}
      const metadata = Reflector.getClassLevelMeta(Module1)![0];
      expect(isRootModule(metadata)).toBe(true);
    });

    it('returns false for DecoratorMeta with ModuleAspectHandler when moduleRole is not root', () => {
      const moduleAspect = new ModuleAspectHandler({});
      const decorMeta = new DecoratorMeta(rootModule, moduleAspect);
      expect(isRootModule(decorMeta)).toBe(false);
    });

    it('returns true for DecoratorMeta with ModuleAspectHandler when moduleRole is root', () => {
      const moduleAspect = new ModuleAspectHandler({});
      moduleAspect.moduleRole = 'root';
      const decorMeta = new DecoratorMeta(rootModule, moduleAspect);
      expect(isRootModule(decorMeta)).toBe(true);
    });

    it('returns true for NormalizedModuleMeta with RootModuleOptions', () => {
      @rootModule({})
      class Module1 {}

      const normalizedModuleMeta = new NormalizedModuleMeta();
      const metadata = Reflector.getClassLevelMeta(Module1)![0];
      normalizedModuleMeta.staticModuleOptions = metadata.value;
      expect(isRootModule(normalizedModuleMeta)).toBe(true);
    });

    it('returns false for NormalizedModuleMeta with empty staticAspectOptions', () => {
      const normalizedModuleMeta = new NormalizedModuleMeta();
      normalizedModuleMeta.staticModuleOptions = {};
      expect(isRootModule(normalizedModuleMeta)).toBe(false);
    });

    it('returns false for NormalizedModuleMeta with ModuleAspectHandler when moduleRole is not root', () => {
      const moduleAspect = new ModuleAspectHandler({});
      const normalizedModuleMeta = new NormalizedModuleMeta();
      normalizedModuleMeta.staticModuleOptions = moduleAspect.staticAspectOptions;
      expect(isRootModule(normalizedModuleMeta)).toBe(false);
    });

    it('returns true for NormalizedModuleMeta with ModuleAspectHandler when moduleRole is root', () => {
      const moduleAspect = new ModuleAspectHandler({});
      moduleAspect.moduleRole = 'root';
      const normalizedModuleMeta = new NormalizedModuleMeta();
      normalizedModuleMeta.staticModuleOptions = moduleAspect.staticAspectOptions;
      expect(isRootModule(normalizedModuleMeta)).toBe(true);
    });

    it('returns true for direct ModuleAspectHandler instance when moduleRole is root', () => {
      const moduleAspect = new ModuleAspectHandler({});
      moduleAspect.moduleRole = 'root';
      expect(isRootModule(moduleAspect)).toBe(true);
    });

    it('returns false for direct ModuleAspectHandler instance when moduleRole is not root', () => {
      const moduleAspect = new ModuleAspectHandler({});
      expect(isRootModule(moduleAspect)).toBe(false);
    });

    it('returns true for RootModuleOptions instance', () => {
      expect(isRootModule(new RootModuleOptions())).toBe(true);
    });
  });

  describe('isModuleDecorator()', () => {
    it('returns true for rootModule DecoratorMeta', () => {
      @rootModule({})
      class Module1 {}
      const metadata = Reflector.getClassLevelMeta(Module1)![0];
      expect(isModuleDecorator(metadata)).toBe(true);
    });

    it('returns true for a class with rootModule decorator', () => {
      @rootModule({})
      class Module1 {}
      // Passing the class directly
      expect(isModuleDecorator(Module1 as any)).toBe(true);
    });

    it('returns true for featureModule DecoratorMeta', () => {
      @featureModule({})
      class Module2 {}
      const metadata = Reflector.getClassLevelMeta(Module2)![0];
      expect(isModuleDecorator(metadata)).toBe(true);
    });

    it('returns true for RootModuleOptions instance', () => {
      expect(isModuleDecorator(new RootModuleOptions())).toBe(true);
    });

    it('returns true for FeatureModuleOptions instance', () => {
      expect(isModuleDecorator(new FeatureModuleOptions())).toBe(true);
    });

    it('returns false for non-module metadata or random object', () => {
      const otherDecorMeta = new DecoratorMeta(function () {}, {});
      expect(isModuleDecorator(otherDecorMeta)).toBe(false);
      expect(isModuleDecorator({} as any)).toBe(false);
    });
  });

  describe('isModuleWithModuleAspect()', () => {
    it('returns true for DecoratorMeta wrapping ModuleAspectHandler', () => {
      const moduleAspect = new ModuleAspectHandler({});
      const decorMeta = new DecoratorMeta(featureModule, moduleAspect);
      expect(isModuleWithModuleAspect(decorMeta)).toBe(true);
    });

    it('returns false for DecoratorMeta not wrapping ModuleAspectHandler', () => {
      const decorMeta = new DecoratorMeta(featureModule, new FeatureModuleOptions());
      expect(isModuleWithModuleAspect(decorMeta)).toBe(false);
    });

    it('returns true for direct ModuleAspectHandler instance', () => {
      const moduleAspect = new ModuleAspectHandler({});
      expect(isModuleWithModuleAspect(moduleAspect)).toBe(true);
    });

    it('returns false for other object or undefined', () => {
      expect(isModuleWithModuleAspect({} as any)).toBe(false);
      expect(isModuleWithModuleAspect()).toBe(false);
    });
  });

  describe('hasDeclaredInDir()', () => {
    it('returns true when declaredInDir is set and not "."', () => {
      const metadata = new DecoratorMeta(featureModule, new FeatureModuleOptions());
      metadata.declaredInDir = '/some/path';
      expect(hasDeclaredInDir(metadata)).toBe(true);
    });

    it('returns false when declaredInDir is "."', () => {
      const metadata = new DecoratorMeta(featureModule, new FeatureModuleOptions());
      metadata.declaredInDir = '.';
      expect(hasDeclaredInDir(metadata)).toBe(false);
    });

    it('returns false when declaredInDir is undefined', () => {
      const metadata = new DecoratorMeta(featureModule, new FeatureModuleOptions());
      expect(hasDeclaredInDir(metadata)).toBe(false);
    });

    it('returns false when argument is undefined', () => {
      expect(hasDeclaredInDir()).toBe(false);
    });
  });

  describe('isDynamicModule()', () => {
    it('returns false for standard decorated module class', () => {
      @featureModule({})
      class Module1 {}

      expect(isDynamicModule(Module1)).toBe(false);
    });

    it('returns true for dynamic module object', () => {
      @featureModule({})
      class Module1 {
        static withOpts(): DynamicModule<Module1> {
          return {
            module: Module1,
            providersPerMod: [],
          };
        }
      }

      const modObj = Module1.withOpts();
      expect(isDynamicModule(modObj)).toBe(true);
    });

    it('returns false for undefined', () => {
      expect(isDynamicModule()).toBe(false);
    });
  });
});
