import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseQueryApi, FetchArgs } from "@reduxjs/toolkit/query/react";
import {
  LOGIN_TICKET_HEADER,
  captureLoginTicketFromUrl,
  getLoginTicket,
  setLoginTicket,
  withLoginTicket,
} from "./loginTicket";

// The backend refuses the sign-in MFA step and the session callbacks without
// the ticket from the first-factor response (AS-001/002). These tests pin the
// client side of that contract.

const api = {} as BaseQueryApi;

function fakeBaseQuery(data: unknown) {
  return vi.fn(async (_args: string | FetchArgs) => ({ data }));
}

function sentHeader(mock: ReturnType<typeof fakeBaseQuery>): string | null {
  const args = mock.mock.calls[0][0] as FetchArgs;
  return new Headers(args.headers as HeadersInit | undefined).get(LOGIN_TICKET_HEADER);
}

describe("withLoginTicket", () => {
  beforeEach(() => sessionStorage.clear());

  it("captures the ticket a first-factor response hands out", async () => {
    const bq = fakeBaseQuery({ email: "a@x.test", login_ticket: "t-1" });
    await withLoginTicket(bq)({ url: "/authsec/uflow/login", method: "POST" }, api, {});
    expect(getLoginTicket()).toBe("t-1");
  });

  it("sends the ticket on MFA steps and callbacks only", async () => {
    setLoginTicket("t-2");

    const mfa = fakeBaseQuery({});
    await withLoginTicket(mfa)({ url: "/authsec/webauthn/admin/beginAuthentication" }, api, {});
    expect(sentHeader(mfa)).toBe("t-2");

    const other = fakeBaseQuery({});
    await withLoginTicket(other)({ url: "/authsec/applications" }, api, {});
    expect(sentHeader(other)).toBeNull();
  });

  it("drops the ticket once a session callback has spent it", async () => {
    setLoginTicket("t-3");
    const cb = fakeBaseQuery({ access_token: "jwt" });
    await withLoginTicket(cb)({ url: "/authsec/uflow/login/webauthn-callback", method: "POST" }, api, {});
    expect(sentHeader(cb)).toBe("t-3");
    expect(getLoginTicket()).toBeNull();
  });

  it("keeps the ticket when a callback fails", async () => {
    setLoginTicket("t-4");
    const cb = vi.fn(async () => ({ error: { status: 401, data: {} } as const }));
    await withLoginTicket(cb)({ url: "/authsec/uflow/auth/enduser/webauthn-callback" }, api, {});
    expect(getLoginTicket()).toBe("t-4");
  });
});

describe("captureLoginTicketFromUrl", () => {
  it("stores a ticket from the SAML redirect and strips it from the address bar", () => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/oidc/login?success=true&login_ticket=t-5&user_email=u%40x.test");
    captureLoginTicketFromUrl();
    expect(getLoginTicket()).toBe("t-5");
    expect(window.location.search).not.toContain("login_ticket");
    expect(window.location.search).toContain("success=true");
  });
});
