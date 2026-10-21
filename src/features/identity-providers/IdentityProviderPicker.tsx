/**
 * `IdentityProviderPicker` — choose which identity provider people sign in
 * through. Lists the workspace's providers (GET /authsec/identity-providers)
 * with each one's domain (read from GET /authsec/identity-providers/:id) and
 * protocol, plus the built-in AuthSec directory, and ends with
 * "+ Create new identity provider", which opens /identity-providers/new and
 * comes back here with `?idp=<new id>`.
 *
 * A page that loads with `?idp=<id>` gets that provider preselected.
 *
 * Not shown: a per-provider user count. No endpoint returns users grouped by
 * identity provider.
 */

import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  useGetOIDCIdentityProviderQuery,
  useListIdentityProvidersQuery,
  type IdentityProvider,
} from "@/app/api/authMethodApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Picker value for "users are managed in AuthSec, no external provider". */
export const AUTHSEC_DIRECTORY = "authsec";
const CREATE_NEW = "__create_identity_provider__";

const PROTOCOL: Record<string, string> = {
  oidc: "OIDC",
  saml: "SAML",
  ad: "LDAP",
  entra: "OIDC",
  scim: "SCIM",
};

function protocolLabel(provider: Pick<IdentityProvider, "provider_type">): string {
  return PROTOCOL[provider.provider_type] ?? provider.provider_type.toUpperCase();
}

function hostOf(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

/** The provider's domain, from its sign-in URL (OIDC authorize URL or SAML SSO URL). */
function useProviderDomain(id: string | null): string | null {
  const { data } = useGetOIDCIdentityProviderQuery(id ?? "", { skip: !id || id === AUTHSEC_DIRECTORY });
  const config = (data?.config ?? {}) as Record<string, unknown>;
  return hostOf(config.authorization_url) ?? hostOf(config.sso_url) ?? hostOf(config.entity_id);
}

/** Path + query to come back to, with any old `idp` removed. */
function currentReturnTo(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete("idp");
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function newIdentityProviderHref(returnTo: string): string {
  return `/identity-providers/new?returnTo=${encodeURIComponent(returnTo)}`;
}

function ProviderOption({ provider }: { provider: IdentityProvider }) {
  const domain = useProviderDomain(provider.id);
  const meta = [domain, protocolLabel(provider), provider.status === "disabled" ? "Disabled" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="flex min-w-0 flex-col py-0.5">
      <span className="truncate font-semibold text-(--color-text)">{provider.display_name}</span>
      <span className="truncate font-mono text-[length:13px] text-(--color-text-muted)">{meta}</span>
    </span>
  );
}

function SelectedLabel({ provider }: { provider: IdentityProvider }) {
  const domain = useProviderDomain(provider.id);
  return (
    <span className="truncate">
      {provider.display_name}
      {domain ? <span className="text-(--color-text-muted)"> ({domain})</span> : null}
    </span>
  );
}

export function IdentityProviderPicker({
  id,
  value,
  onChange,
  returnTo,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  id: string;
  value: string | null;
  onChange: (value: string) => void;
  /** Where "Create new identity provider" comes back to. Defaults to this page. */
  returnTo?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data, isLoading, isError, refetch } = useListIdentityProvidersQuery();
  const providers = useMemo(() => data ?? [], [data]);
  const fromUrl = searchParams.get("idp");

  // Preselect ?idp=<id> once the list has it (a provider just created).
  // Applied once per id, so a later choice isn't overwritten.
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!fromUrl || applied.current === fromUrl) return;
    if (fromUrl === AUTHSEC_DIRECTORY || providers.some((p) => p.id === fromUrl)) {
      applied.current = fromUrl;
      if (value !== fromUrl) onChange(fromUrl);
    }
  }, [fromUrl, providers, value, onChange]);

  // A provider created a moment ago may be missing from a cached list.
  useEffect(() => {
    if (fromUrl && fromUrl !== AUTHSEC_DIRECTORY && data && !data.some((p) => p.id === fromUrl)) void refetch();
  }, [fromUrl, data, refetch]);

  const selected = providers.find((p) => p.id === value);
  const target = returnTo ?? currentReturnTo(location.pathname, location.search);

  return (
    <Select
      value={value ?? ""}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === CREATE_NEW) navigate(newIdentityProviderHref(target));
        else onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        className="w-full"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <SelectValue placeholder={isLoading ? "Loading identity providers…" : "Choose an identity provider"}>
          {selected ? (
            <SelectedLabel provider={selected} />
          ) : value === AUTHSEC_DIRECTORY ? (
            "AuthSec directory"
          ) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {isError ? (
          <div className="px-2 py-2 text-[length:13px] text-(--color-danger-text)">
            Couldn't load identity providers.
          </div>
        ) : null}
        {providers.map((p) => (
          <SelectItem key={p.id} value={p.id} className="py-2">
            <ProviderOption provider={p} />
          </SelectItem>
        ))}
        <SelectItem value={AUTHSEC_DIRECTORY} className="py-2">
          <span className="flex min-w-0 flex-col py-0.5">
            <span className="font-semibold text-(--color-text)">AuthSec directory</span>
            <span className="text-[length:13px] text-(--color-text-muted)">Users managed in AuthSec</span>
          </span>
        </SelectItem>
        <SelectSeparator />
        <SelectItem value={CREATE_NEW} className="py-2 font-medium text-(--color-primary-text)">
          + Create new identity provider
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
