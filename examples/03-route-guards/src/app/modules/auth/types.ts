/**
 * Represents an authenticated user.
 */
export interface AuthUser {
  id: number;
  username: string;
  permissions: Permission[];
}

/**
 * Available permissions in the system.
 */
export const enum Permission {
  read = 'read',
  write = 'write',
  admin = 'admin',
}
