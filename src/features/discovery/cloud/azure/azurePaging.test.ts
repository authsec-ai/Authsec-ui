import { describe, expect, it } from "vitest";

import { pageSizeParam, pageSlice, parsePageSize } from "./azurePaging";
import { subscriptionLabel, tenantName } from "./azureInventoryLabels";
import { connectorLabel, shortId } from "./azureDiscoveryLabels";

describe("parsePageSize", () => {
  it("accepts the three AWS-matching sizes", () => {
    expect(parsePageSize("25")).toBe(25);
    expect(parsePageSize("50")).toBe(50);
    expect(parsePageSize("100")).toBe(100);
  });
  it("falls back to the default (25) for anything else", () => {
    expect(parsePageSize(null)).toBe(25);
    expect(parsePageSize(undefined)).toBe(25);
    expect(parsePageSize("")).toBe(25);
    expect(parsePageSize("10")).toBe(25);
    expect(parsePageSize("not-a-number")).toBe(25);
  });
});

describe("pageSizeParam", () => {
  it("writes nothing for the default size", () => {
    expect(pageSizeParam(25)).toBeNull();
  });
  it("writes the chosen size otherwise", () => {
    expect(pageSizeParam(50)).toBe("50");
    expect(pageSizeParam(100)).toBe("100");
  });
});

describe("pageSlice", () => {
  const rows = Array.from({ length: 140 }, (_, i) => i);
  it("slices by page size", () => {
    expect(pageSlice(rows, 25, 0)).toEqual({ rows: rows.slice(0, 25), pageIndex: 0, pages: 6 });
    expect(pageSlice(rows, 25, 1)).toEqual({ rows: rows.slice(25, 50), pageIndex: 1, pages: 6 });
  });
  it("clamps a page index past the end to the last page", () => {
    expect(pageSlice(rows, 25, 99).pageIndex).toBe(5);
  });
  it("clamps a negative page index to the first page", () => {
    expect(pageSlice(rows, 25, -1).pageIndex).toBe(0);
  });
  it("is always at least one page, even for no rows", () => {
    expect(pageSlice([], 25, 0)).toEqual({ rows: [], pageIndex: 0, pages: 1 });
  });
});

describe("shortId", () => {
  it("shortens a GUID", () => {
    expect(shortId("3f1c6a52-8d1e-4b7a-9c20-5e6a41b0d7c3")).toBe("3f1c6a52…b0d7c3");
  });
  it("leaves a non-GUID string as written", () => {
    expect(shortId("Contoso Ltd")).toBe("Contoso Ltd");
    expect(shortId("not-a-guid")).toBe("not-a-guid");
  });
});

describe("tenantName", () => {
  const withName = { attrs: { tenant_display_name: "Contoso Ltd" } } as Parameters<typeof tenantName>[0];
  const withoutName = { attrs: {} } as Parameters<typeof tenantName>[0];
  it("uses the tenant's display name when the connector has one", () => {
    expect(tenantName(withName, "3f1c6a52-8d1e-4b7a-9c20-5e6a41b0d7c3")).toBe("Contoso Ltd");
  });
  it("falls back to a short id, never the full GUID", () => {
    expect(tenantName(withoutName, "3f1c6a52-8d1e-4b7a-9c20-5e6a41b0d7c3")).toBe("3f1c6a52…b0d7c3");
    expect(tenantName(undefined, "3f1c6a52-8d1e-4b7a-9c20-5e6a41b0d7c3")).toBe("3f1c6a52…b0d7c3");
  });
});

describe("subscriptionLabel", () => {
  it("shortens a subscription id", () => {
    expect(subscriptionLabel("3f1c6a52-8d1e-4b7a-9c20-5e6a41b0d7c3")).toBe("3f1c6a52…b0d7c3");
  });
  it("says Tenant-wide when there is no subscription", () => {
    expect(subscriptionLabel(null)).toBe("Tenant-wide");
    expect(subscriptionLabel(undefined)).toBe("Tenant-wide");
  });
});

describe("connectorLabel", () => {
  it("names a tenant by its display name, else a short id", () => {
    const named = { scope_kind: "tenant", scope_id: "3f1c6a52-8d1e-4b7a-9c20-5e6a41b0d7c3", attrs: { tenant_display_name: "Contoso Ltd" } } as Parameters<typeof connectorLabel>[0];
    const unnamed = { scope_kind: "tenant", scope_id: "3f1c6a52-8d1e-4b7a-9c20-5e6a41b0d7c3", attrs: {} } as Parameters<typeof connectorLabel>[0];
    expect(connectorLabel(named)).toBe("Contoso Ltd");
    expect(connectorLabel(unnamed)).toBe("Tenant 3f1c6a52…b0d7c3");
  });
  it("names a subscription by its display name, else a short id", () => {
    const named = { scope_kind: "subscription", scope_id: "c0a1b2d3-1111-4aaa-8bbb-000000000001", attrs: { display_name: "Contoso Production" } } as Parameters<typeof connectorLabel>[0];
    const unnamed = { scope_kind: "subscription", scope_id: "c0a1b2d3-1111-4aaa-8bbb-000000000001", attrs: {} } as Parameters<typeof connectorLabel>[0];
    expect(connectorLabel(named)).toBe("Contoso Production");
    expect(connectorLabel(unnamed)).toBe("c0a1b2d3…000001");
  });
  it("says Unknown for no connector", () => {
    expect(connectorLabel(undefined)).toBe("Unknown");
  });
});
