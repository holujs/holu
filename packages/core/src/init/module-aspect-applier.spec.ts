import { featureModule } from '#decorators/feature-module.js';
import { StaticAspectOptions, ModuleAspectHandler, ModuleAspectDecorator } from '#decorators/module-aspects.js';
import { BaseNormalizedModuleMeta, NormalizedModuleMeta } from '#init/normalized-meta.js';
import { Reflector } from '#di/reflector.js';
import { clearDebugClassNames } from '#utils/get-debug-class-name.js';
import { ModuleNormalizer } from './module-normalizer.js';
import { ModuleAspectApplier } from './module-aspect-applier.js';

describe('ModuleAspectApplier', () => {
  class MockModuleNormalizer extends ModuleNormalizer {
    override normalize(modRefId: any): NormalizedModuleMeta {
      return super.normalize(modRefId, { externalModuleDetectionFailed: () => {} } as any);
    }
  }

  let normalizer: MockModuleNormalizer;
  let applier: ModuleAspectApplier;

  beforeEach(() => {
    clearDebugClassNames();
    normalizer = new MockModuleNormalizer();
    applier = new ModuleAspectApplier();
  });

  describe('aspect decorators', () => {
    interface SomeAspectOptions extends StaticAspectOptions<any> {
      flag?: boolean;
    }

    class SomeAspectMeta extends BaseNormalizedModuleMeta {
      flag?: boolean;
      targetModRefId?: any;
    }

    it('applies hostAspectOptions via applyHostAspectOptions method', () => {
      @featureModule()
      class HostModule {}

      class HostModuleAspect extends ModuleAspectHandler<SomeAspectOptions> {
        override hostModule = HostModule;
        override hostAspectOptions = { flag: true };

        override normalize(normalizedModuleMeta: NormalizedModuleMeta): SomeAspectMeta {
          return {
            flag: this.moduleOptions.flag,
            targetModRefId: normalizedModuleMeta.modRefId,
          } as SomeAspectMeta;
        }
      }

      const hostInitSome: ModuleAspectDecorator<SomeAspectOptions, {}, {}> = Reflector.makeClassDecorator(
        (data) => new HostModuleAspect(data),
      );
      const moduleAspect = new HostModuleAspect({}).clone({ flag: true });

      const normalizedModuleMeta = normalizer.normalize(HostModule);
      applier.applyHostAspectOptions(normalizedModuleMeta, hostInitSome, moduleAspect as any);

      expect(normalizedModuleMeta.normalizedAspectMetaMap.get(hostInitSome)).toEqual({ flag: true, targetModRefId: HostModule });
    });
  });
});
