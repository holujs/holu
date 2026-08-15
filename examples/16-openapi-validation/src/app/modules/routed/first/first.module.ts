import { DynamicAspectOptionsMap, DynamicModuleWithAspectOptions } from '@holu/core';
import { ValidationModule } from '@holu/openapi-validation';
import { BodyParserModule } from '@holu/body-parser';
import { restAspect, restModule } from '@holu/rest';

import { FirstController } from './first.controller.js';

@restModule({
  imports: [BodyParserModule, ValidationModule],
  controllers: [FirstController],
})
export class FirstModule {
  static withPath(path?: string): DynamicModuleWithAspectOptions<FirstModule> {
    const dynamicAspectOptionsMap: DynamicAspectOptionsMap = new Map();
    dynamicAspectOptionsMap.set(restAspect, { path });

    return {
      module: this,
      dynamicAspectOptionsMap,
    };
  }
}
