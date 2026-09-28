/**
 * AWS Regions shown in the onboarding pickers.
 *
 * A curated, common subset of the commercial regions that are enabled by
 * default — not AWS's full list. Scan cost scales with regions × services, so
 * the pickers never offer "select all". Region validity itself is a shape
 * check server-side (internal/awsdiscovery.ValidateRegion), so a region
 * missing here is a display gap, never a hard block.
 *
 * Opt-in regions are listed separately: they can be scanned only when this
 * AuthSec deployment has enabled them on its own AWS account (the backend
 * reports which, as `automatic.optin_scan_regions`), and only when the
 * customer has enabled them too.
 */

export interface AWSRegionOption {
  value: string;
  label: string;
}

export const AWS_REGIONS: AWSRegionOption[] = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-north-1", label: "Europe (Stockholm)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
];

/** Names for the opt-in regions AWS lists as requiring enablement. */
export const AWS_OPT_IN_REGION_LABELS: Record<string, string> = {
  "af-south-1": "Africa (Cape Town)",
  "ap-east-1": "Asia Pacific (Hong Kong)",
  "ap-south-2": "Asia Pacific (Hyderabad)",
  "ap-southeast-3": "Asia Pacific (Jakarta)",
  "ap-southeast-4": "Asia Pacific (Melbourne)",
  "ap-southeast-5": "Asia Pacific (Malaysia)",
  "ap-southeast-7": "Asia Pacific (Thailand)",
  "ca-west-1": "Canada West (Calgary)",
  "eu-central-2": "Europe (Zurich)",
  "eu-south-1": "Europe (Milan)",
  "eu-south-2": "Europe (Spain)",
  "il-central-1": "Israel (Tel Aviv)",
  "me-central-1": "Middle East (UAE)",
  "me-south-1": "Middle East (Bahrain)",
  "mx-central-1": "Mexico (Central)",
};

/** "ap-south-1 — Asia Pacific (Mumbai)", or the bare code when unknown. */
export function awsRegionLabel(region: string): string {
  const known =
    AWS_REGIONS.find((r) => r.value === region)?.label ?? AWS_OPT_IN_REGION_LABELS[region];
  return known ? `${region} — ${known}` : region;
}
