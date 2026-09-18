import { injectable, Extension, ExtensionManager, Logger } from '@holu/core';
import { RestRouteExtension } from '@holu/rest';

@injectable()
export class MyExtension implements Extension<void> {
  constructor(
    private extensionManager: ExtensionManager,
    private logger: Logger,
  ) {}

  async stage1(isLastModule: boolean) {
    const extensionGroupMeta = await this.extensionManager.stage1(RestRouteExtension);
    this.logger.log('info', extensionGroupMeta.groupData[0].controllersMeta);
  }
}
