import type { AuthRouteDescriptor } from "./auth-flow-types";

export const AUTH_ROUTE_REGISTRY: AuthRouteDescriptor[] = [
  {
    path: "/admin/login",
    sceneId: "admin-login",
    entrypoint: "admin",
    title: "Admin Login",
  },
  {
    path: "/admin/verify-otp",
    sceneId: "admin-verify-otp",
    entrypoint: "admin",
    title: "Admin Verify OTP",
  },
  {
    path: "/admin/webauthn",
    sceneId: "admin-webauthn",
    entrypoint: "admin",
    title: "Admin WebAuthn",
  },
  {
    path: "/admin/auth/callback",
    sceneId: "admin-oidc-callback",
    entrypoint: "admin",
    title: "Admin OIDC Callback",
  },
  {
    path: "/admin/create-workspace",
    sceneId: "admin-create-workspace",
    entrypoint: "admin",
    title: "Create Workspace",
  },
  {
    path: "/oidc/login",
    sceneId: "enduser-login",
    entrypoint: "enduser",
    title: "OIDC Login",
  },
  {
    path: "/oidc/auth/callback",
    sceneId: "enduser-oidc-callback",
    entrypoint: "enduser",
    title: "OIDC Callback",
  },
  {
    path: "/oidc/mfa",
    sceneId: "enduser-mfa",
    entrypoint: "enduser",
    title: "OIDC MFA",
  },
  {
    path: "/oidc/error",
    sceneId: "enduser-error",
    entrypoint: "enduser",
    title: "OIDC Error",
  },
];

const normalizeAuthPath = (pathname: string): string => {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
};

export const resolveAuthRouteDescriptor = (
  pathname: string,
): AuthRouteDescriptor | null => {
  const normalizedPath = normalizeAuthPath(pathname);
  return AUTH_ROUTE_REGISTRY.find((route) => route.path === normalizedPath) ?? null;
};
