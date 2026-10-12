// Mirrors the backend's ValidateDomainName: a DNS host name of at least two
// labels (letters, digits, inner hyphens; 63 characters a label, 253 in all),
// a non-numeric top-level label, no IP address, no localhost.

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Why a domain name cannot be added, or null when it can. */
export function domainNameError(value: string): string | null {
  const d = value.trim().toLowerCase().replace(/\.$/, "");
  if (!d) return "Domain name is required";
  if (d.length > 253) return "A domain has at most 253 characters";
  if (d.includes("*")) return "Wildcards are not allowed";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d) || d.includes(":")) return "Use a domain name, not an IP address or port";
  const labels = d.split(".");
  if (labels.length < 2) return "Include the top-level domain (e.g., auth.example.com)";
  const bad = labels.find((l) => !LABEL.test(l));
  if (bad !== undefined) {
    return bad === ""
      ? "Domain has an empty part (two dots in a row)"
      : `"${bad}" is not valid: use letters, digits and hyphens (not at the start or end)`;
  }
  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld)) return "The top-level domain cannot be numeric";
  if (tld === "localhost") return "localhost cannot be verified";
  return null;
}

/** The reason a DNS verification failed, from the API error. */
export function verifyFailureMessage(error: unknown): string {
  const data = (error as { data?: { error?: string; details?: string; message?: string } })?.data;
  // Older backends put the reason in details behind a generic error.
  const generic = data?.error === "verification failed";
  return (
    (generic ? data?.details : data?.error) ||
    data?.details ||
    data?.message ||
    "DNS verification failed. Please check your DNS records and try again."
  );
}
