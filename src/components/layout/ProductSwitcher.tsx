import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, ScanSearch, ShieldCheck, type LucideIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type ProductId = "authsec" | "iga";

interface Product {
  id: ProductId;
  name: string;
  /** Under the name in the sidebar header. */
  tagline: string;
  /** One line in the menu: what the product does. */
  summary: string;
  home: string;
  icon: LucideIcon;
}

const PRODUCTS: Product[] = [
  {
    id: "authsec",
    name: "AuthSec",
    tagline: "Protect MCP servers",
    summary: "Protect MCP servers and control what agents and services can call.",
    home: "/dashboard",
    icon: ShieldCheck,
  },
  {
    id: "iga",
    name: "Agentic IGA",
    tagline: "Govern agents in your clouds",
    summary: "Find AI agents in your AWS, Kubernetes and GitHub accounts and see what they can access.",
    home: "/iga/discovery",
    icon: ScanSearch,
  },
];

function ProductTile({ product, active }: { product: Product; active?: boolean }) {
  const Icon = product.icon;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        active
          ? "bg-(--color-primary) text-white"
          : "bg-(--color-primary-soft) text-(--color-primary-text)",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

/**
 * `ProductSwitcher` — the product name at the top of the sidebar, which opens
 * the list of products (UX proposal, option A). It is in the same place in
 * both consoles and always on screen, so the second product is found without
 * being told where it is. It replaced "Switch product" in the profile menu.
 */
export function ProductSwitcher({ current }: { current: ProductId }) {
  const navigate = useNavigate();
  const product = PRODUCTS.find((p) => p.id === current) ?? PRODUCTS[0];

  return (
    <SidebarMenu className="px-2 group-data-[collapsible=icon]:px-0">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={`${product.name}: switch product`}
              className="h-auto min-h-11 rounded-md px-2 py-1.5 data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
            >
              <ProductTile product={product} active />
              <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                <span className="truncate text-[13.5px] font-semibold leading-tight text-sidebar-foreground">
                  {product.name}
                </span>
                <span className="truncate text-[11.5px] leading-tight text-(--color-text-muted)">
                  {product.tagline}
                </span>
              </span>
              <ChevronDown className="ml-auto size-4 shrink-0 text-(--color-text-muted) group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            sideOffset={6}
            className="w-85 max-w-[calc(100vw-32px)] rounded-xl p-1.5"
          >
            <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-(--color-text-muted)">
              Switch product
            </DropdownMenuLabel>
            {PRODUCTS.map((p) => {
              const isCurrent = p.id === current;
              return (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => {
                    if (!isCurrent) navigate(p.home);
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-lg px-2.5 py-2.5",
                    isCurrent && "bg-(--color-primary-soft) focus:bg-(--color-primary-soft)",
                  )}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <ProductTile product={p} active={isCurrent} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-foreground">{p.name}</span>
                    <span className="block text-[12.5px] leading-snug text-(--color-text-muted)">
                      {p.summary}
                    </span>
                  </span>
                  {isCurrent ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-(--color-primary)" aria-label="Current product" />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
