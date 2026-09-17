import { injectable } from '@holu/core';

import type { AuthUser } from './types.js';
import { Permission } from './types.js';

/**
 * Simulated authentication service.
 *
 * In a real application, `verifyToken()` would validate a JWT or
 * look up a session in a database.
 */
@injectable()
export class AuthService {
  /**
   * Returns the user associated with the given token, or `null`
   * if the token is invalid.
   */
  async verifyToken(token: string): Promise<AuthUser | null> {
    // Simulated token lookup — replace with real logic.
    const users: Record<string, AuthUser> = {
      'token-admin': { id: 1, username: 'admin', permissions: [Permission.read, Permission.write, Permission.admin] },
      'token-editor': { id: 2, username: 'editor', permissions: [Permission.read, Permission.write] },
      'token-viewer': { id: 3, username: 'viewer', permissions: [Permission.read] },
    };

    return users[token] ?? null;
  }
}
