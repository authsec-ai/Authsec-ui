import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseQueryApi, FetchArgs, FetchBaseQueryMeta } from "@reduxjs/toolkit/query/react";
import {
  LOGOUT_ACTION_TYPE,
  isSignInRequest,
  loginPathFor,
  resetUnauthorizedHandler,
  withUnauthorizedHandler,
} from "./unauthorized";
import { logout } from "./slices/authSlice";
import { SESSION_KEY } from "../utils/sessionManager";

// UI-011: a 401 on a request made with the console session ends the session
// and goes to the sign-in page; sign-in requests and foreign tokens do not.

const TOKEN = "header.payload.sig";

function fakeApi(isAuthenticated = true) {
  const dispatch = vi.fn();
  const api = { dispatch, getState: () => ({ auth: { isAuthenticated } }) } as unknown as BaseQueryApi;
  return { api, dispatch };
}

function respond(status: number, bearer: string | null) {
  return vi.fn(async (args: string | FetchArgs) => {
    const url = typeof args === "string" ? args : args.url;
    const headers = new Headers();
    if (bearer) headers.set("Authorization", bearer);
    const meta = { request: new Request(`http://api.test${url}`, { headers }) } as FetchBaseQueryMeta;
    return status === 200 ? { data: {}, meta } : { error: { status, data: {} } as const, meta };
  });
}

function run(status: number, url: string, opts: { bearer?: string | null; path?: string; authed?: boolean } = {}) {
  const redirect = vi.fn();
  const { api, dispatch } = fakeApi(opts.authed ?? true);
  const bq = withUnauthorizedHandler(respond(status, opts.bearer === undefined ? `Bearer ${TOKEN}` : opts.bearer), {
    redirect,
    currentPath: () => opts.path ?? "/applications",
  });
  return bq({ url }, api, {}).then(() => ({ redirect, dispatch }));
}

describe("withUnauthorizedHandler", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: TOKEN }));
    resetUnauthorizedHandler();
  });

  it("clears the session, logs out and redirects on a 401 with the session token", async () => {
    const { redirect, dispatch } = await run(401, "/authsec/applications");
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(dispatch).toHaveBeenCalledWith({ type: LOGOUT_ACTION_TYPE });
    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("dispatches the auth slice's own logout action", () => {
    expect(logout.type).toBe(LOGOUT_ACTION_TYPE);
  });

  it("redirects once for a burst of 401s", async () => {
    const first = await run(401, "/authsec/applications");
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: TOKEN }));
    const second = await run(401, "/authsec/roles");
    expect(first.redirect).toHaveBeenCalledTimes(1);
    expect(second.redirect).not.toHaveBeenCalled();
  });

  it("ignores other statuses", async () => {
    for (const status of [200, 403, 404, 500]) {
      const { redirect, dispatch } = await run(status, "/authsec/applications");
      expect(redirect).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    }
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it("ignores 401s from sign-in requests", async () => {
    for (const url of [
      "/authsec/uflow/login",
      "/authsec/uflow/login/webauthn-callback",
      "/authsec/webauthn/admin/beginAuthentication",
      "/authsec/uflow/auth/workspace/totp/login",
      "/authsec/uflow/user/login",
      "/authsec/hmgr/auth/exchange-token",
    ]) {
      const { redirect, dispatch } = await run(401, url);
      expect(redirect, url).not.toHaveBeenCalled();
      expect(dispatch, url).not.toHaveBeenCalled();
    }
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it("ignores 401s for a token that is not the session's", async () => {
    const { redirect, dispatch } = await run(401, "/authsec/uflow/admin/users/list", { bearer: "Bearer other" });
    expect(redirect).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("handles a tokenless 401 only when the UI thinks it is signed in", async () => {
    const out = await run(401, "/authsec/applications", { bearer: null, authed: false });
    expect(out.redirect).not.toHaveBeenCalled();
    const inn = await run(401, "/authsec/applications", { bearer: null, authed: true });
    expect(inn.redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("leaves the hosted end-user pages and sign-in screens alone", async () => {
    for (const path of ["/oidc/auth/callback", "/authsec/oidc/login", "/admin/login"]) {
      const { redirect, dispatch } = await run(401, "/authsec/applications", { path });
      expect(redirect, path).not.toHaveBeenCalled();
      expect(dispatch, path).not.toHaveBeenCalled();
    }
  });
});

describe("helpers", () => {
  it("classifies sign-in requests", () => {
    expect(isSignInRequest("/authsec/uflow/login")).toBe(true);
    expect(isSignInRequest("authsec/webauthn/x")).toBe(true);
    expect(isSignInRequest("/authsec/connector-oauth/callback")).toBe(true);
    expect(isSignInRequest("/authsec/uflow/admin/users/list")).toBe(false);
    expect(isSignInRequest("/authsec/uflow/user/admin/reset-password")).toBe(false);
  });

  it("picks the console sign-in page", () => {
    expect(loginPathFor("/users")).toBe("/admin/login");
    expect(loginPathFor("/admin/users")).toBe("/admin/login");
    expect(loginPathFor("/admin/login")).toBeNull();
    expect(loginPathFor("/oidc/login")).toBeNull();
  });
});
