/**
 * ProviderIcon — renders the brand logo for an identity provider, matched by
 * `provider_name` (with a `provider_type` fallback). Reuses the colored brand
 * SVGs already in the app (Google/Microsoft from CreateAuthMethodPage) and
 * Tabler brand marks for the rest; unknown providers fall back to a generic
 * SAML/OIDC icon. Used by the Identity Providers table.
 */

import type { ComponentType } from "react";
import {
  IconBrandApple,
  IconBrandAuth0,
  IconBrandBitbucket,
  IconBrandDiscord,
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandGitlab,
  IconBrandLinkedin,
  IconBrandSlack,
  IconBrandX,
} from "@tabler/icons-react";
import { Fingerprint, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

type IconProps = { className?: string };
type IconCmp = ComponentType<IconProps>;

/** Google's 4-color mark (reused from CreateAuthMethodPage OIDC_TEMPLATES). */
function GoogleMark({ className }: IconProps) {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/** Microsoft's 4-square mark (reused from CreateAuthMethodPage OIDC_TEMPLATES). */
function MicrosoftMark({ className }: IconProps) {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 23 23" aria-hidden>
      <path d="M0 0h11v11H0z" fill="#f25022" />
      <path d="M12 0h11v11H12z" fill="#00a4ef" />
      <path d="M0 12h11v11H0z" fill="#ffb900" />
      <path d="M12 12h11v11H12z" fill="#7fba00" />
    </svg>
  );
}

// provider_name keyword → brand icon. First match wins.
const MATCHERS: Array<[RegExp, IconCmp]> = [
  [/google|gmail|gsuite|g-?suite|workspace/, GoogleMark],
  [/microsoft|azure|entra|office|outlook|live\.com/, MicrosoftMark],
  [/github/, IconBrandGithub],
  [/gitlab/, IconBrandGitlab],
  [/bitbucket/, IconBrandBitbucket],
  [/apple/, IconBrandApple],
  [/facebook|meta/, IconBrandFacebook],
  [/slack/, IconBrandSlack],
  [/discord/, IconBrandDiscord],
  [/linkedin/, IconBrandLinkedin],
  [/auth0/, IconBrandAuth0],
  [/twitter|(?:^|[^a-z])x(?:$|[^a-z])/, IconBrandX],
];

export function getProviderIconComponent(
  providerName?: string,
  providerType?: string,
): IconCmp {
  const key = (providerName ?? "").toLowerCase();
  const match = MATCHERS.find(([re]) => re.test(key));
  if (match) return match[1];
  if (providerType === "saml") return ShieldCheck;
  return Fingerprint;
}

export function ProviderIcon({
  providerName,
  providerType,
  className,
}: {
  providerName?: string;
  providerType?: string;
  className?: string;
}) {
  const Icon = getProviderIconComponent(providerName, providerType);
  return <Icon className={className} />;
}
