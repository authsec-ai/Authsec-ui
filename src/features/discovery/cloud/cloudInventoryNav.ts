/**
 * The Cloud Inventory tab set — data only.
 *
 * Split from `CloudInventoryTabs.tsx` for the same reason `awsInventoryState.ts`
 * was split from `AWSInventoryNotices.tsx`: the repo's react-refresh lint rule
 * wants a component file to export only components, and both the tab strip and
 * the layout shell need this list — the strip for its labels, the shell for the
 * active tab's description.
 */

/** The tab keys, which are also the route segments under `/iga/cloud`. */
export type CloudInventoryTabKey = "identities" | "compute" | "resources";

export interface CloudInventoryTab {
  key: CloudInventoryTabKey;
  label: string;
  /** Rendered as the page description while this tab is active. Lifted
   * verbatim from each page's former `<ConsolePage description>`. */
  description: string;
  /**
   * Whether this tab honours `?account=`.
   *
   * False for Compute, and not an oversight: that page deliberately shows every
   * connected account at once so compute nobody can attribute cannot hide
   * behind an account filter (see its own header). Carrying `account` there
   * would put a scope in the URL that the page then ignores — a shared link
   * that reads as filtered while showing everything.
   */
  scopedByAccount: boolean;
}

/**
 * Labels are provider-neutral on purpose. The GCP build workflow's console row
 * — "Built for AWS, provider-filterable… GCP inherits an inventory UI rather
 * than needing one built" — means a second provider filters into these same
 * three tabs rather than adding "GCP Identities" beside "AWS Identities".
 *
 * The descriptions still name AWS, because AWS is the only provider with
 * inventory list endpoints today (`cloudDiscoveryApi.ts`: "There are still no
 * GCP identity/secret/permission/resource LIST endpoints"). They lose the
 * AWS-specific wording when a second provider can actually fill these tables,
 * which is a copy change and not a routing one.
 */
export const CLOUD_INVENTORY_TABS: CloudInventoryTab[] = [
  {
    key: "identities",
    label: "Identities",
    description:
      "The IAM roles and users each scan collected from your AWS accounts, as collected. For how they connect to workloads and resources, use Explore › Identities.",
    scopedByAccount: true,
  },
  {
    key: "compute",
    label: "Compute",
    description:
      "The Lambda functions, ECS task definitions, EC2 instances and Bedrock runtimes each scan collected, as collected. To investigate one, use Explore › Agents & workloads.",
    scopedByAccount: false,
  },
  {
    key: "resources",
    label: "Resources",
    description:
      "The S3 buckets, DynamoDB tables, KMS keys and secrets each scan collected, as collected. For what policies name and who holds it, use Explore › Resources.",
    scopedByAccount: true,
  },
];

/**
 * Query params a tab switch keeps, for a tab that honours them.
 *
 * `account` scopes a table to one connected account, so dropping it on a tab
 * switch would silently widen what the reader is looking at — but it is only
 * carried to a tab whose `scopedByAccount` is true, because putting it in the
 * URL of a page that ignores it is the same lie in the other direction.
 * `provider` is here ahead of the filter control that will set it, so the
 * carry-over rule does not have to be revisited when it ships.
 *
 * Everything else is deliberately dropped. `kind` means `iam_role` on
 * Identities and `s3_bucket` on Resources; `attribution` and `runtime` exist
 * only on Compute. Carrying any of them across would apply a filter that
 * matches nothing and read as an empty account.
 */
export const CARRIED_TAB_PARAMS = ["account", "provider"] as const;

/** Params that only travel to a tab that actually reads them. */
export const ACCOUNT_SCOPED_PARAMS = new Set<string>(["account"]);
