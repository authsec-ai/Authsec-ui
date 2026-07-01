/**
 * Admin APIs - Index
 *
 * Admin-only endpoints for managing workspace entities.
 * These require AdminAuthMiddleware (admin role in JWT).
 *
 * Note: rolesApi and permissionsApi were removed — they were duplicates of the
 * top-level rolesApi.ts and permissionsApi.ts and were never imported. Role and
 * permission management uses the top-level API slices or the application-scoped
 * endpoints in setupWizardApi / scopeMatrixApi.
 */

export * from './resourcesApi';
export * from './usersApi';
