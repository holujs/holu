import { restModule } from '@holu/rest';

import { AuthService } from './auth/auth.service.js';
import { BearerGuard } from './auth/bearer.guard.js';
import { PermissionsGuard } from './auth/permissions.guard.js';
import { BasicGuard } from './auth/basic.guard.js';

@restModule({
  providersPerReq: [AuthService, BearerGuard, PermissionsGuard, BasicGuard],
  exports: [BearerGuard, PermissionsGuard, BasicGuard],
})
export class AuthModule {}
