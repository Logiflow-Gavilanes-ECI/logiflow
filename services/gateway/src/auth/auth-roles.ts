export const AUTH_ROLES = ['admin', 'conductor'] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];
