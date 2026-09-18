import { type ServerResponse } from 'node:http';
import { RequestContext, controller, route } from '@holu/rest';
import { RouteScopedMulterParser } from '@holu/body-parser';

import { saveFiles, sendHtmlForm } from './utils.js';

@controller({ scope: 'route' })
export class RouteScopedController {
  constructor(protected parse: RouteScopedMulterParser) {}

  @route('GET', 'route-scoped')
  tellHello(ctx: RequestContext) {
    ctx.send('Hello, you need send POST request');
  }

  @route('POST', 'route-scoped')
  post(ctx: RequestContext) {
    ctx.sendJson(ctx.body);
  }

  @route('GET', 'route-scoped-file-upload')
  getHtmlForm(ctx: RequestContext) {
    sendHtmlForm(ctx.rawRes);
  }

  @route('POST', 'route-scoped-file-upload')
  async downloadFile(ctx: RequestContext) {
    const parsedForm = await this.parse.array(ctx, 'fieldName', 5);
    await saveFiles(parsedForm);
    (ctx.rawRes as ServerResponse).writeHead(303, { Location: '/route-scoped-file-upload' });
    ctx.rawRes.end();
  }
}
