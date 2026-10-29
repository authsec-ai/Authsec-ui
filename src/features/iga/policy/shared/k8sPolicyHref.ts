/** "Create policy" for Kubernetes (UI-054): the form on Kubernetes, with the ServiceAccount chosen when there is one. */
export function k8sPolicyHref(sa?: { id: string; name: string }): string {
  const q = new URLSearchParams({ provider: "k8s" });
  if (sa?.id) {
    q.set("identity_account_id", sa.id);
    q.set("sa", sa.name);
  }
  return `/iga/policy/new?${q.toString()}`;
}
