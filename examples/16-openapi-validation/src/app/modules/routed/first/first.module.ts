import { DynamicAspectOptionsMap, DynamicModuleWithMixinOptions } from '@holu/core';
import { ValidationModule } from '@holu/openapi-validation';
import { BodyParserModule } from '@holu/body-parser';
import { aspectRest, restModule } from '@holu/rest';

import { FirstController } from './first.controller.js';

@restModule({
  imports: [BodyParserModule, ValidationModule],
  controllers: [FirstController],
})
export class FirstModule {
  static withPath(path?: string): DynamicModuleWithMixinOptions<FirstModule> {
    const aspectOptions: DynamicAspectOptionsMap = new Map();
    aspectOptions.set(aspectRest, { path });

    return {
      module: this,
      aspectOptions,
    };
  }
}
