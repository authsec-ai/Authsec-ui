import { describe, expect, it } from "vitest";

import { ENTRA_PERMISSION_KINDS, permissionCount, resourceExclusions } from "./entraPermissions";

describe("Entra permissions in Azure Resources (UI-056)", () => {
  it("leaves them out of Resources unless shown or picked by kind", () => {
    expect(resourceExclusions("resources", undefined, false)).toEqual([...ENTRA_PERMISSION_KINDS]);
    expect(resourceExclusions("resources", undefined, true)).toBeUndefined();
    expect(resourceExclusions("resources", "entra_app_role", false)).toBeUndefined();
    expect(resourceExclusions("identities", undefined, false)).toBeUndefined();
  });

  it("counts the permissions the kind facet reports", () => {
    const facets = {
      kind: [
        { value: "microsoft.storage/storageaccounts", label: "Storage account", count: 3 },
        { value: "entra_app_role", label: "Application permission", count: 40 },
        { value: "entra_delegated_scope", label: "Delegated permission", count: 12 },
      ],
    };
    expect(permissionCount(facets)).toBe(52);
    expect(permissionCount(undefined)).toBe(0);
  });
});
