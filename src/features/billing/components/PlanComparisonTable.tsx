import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Plan } from "../types";

interface PlanComparisonTableProps {
  plans: Plan[];
  onUpgrade: () => void;
  isMutating: boolean;
}

const DEFAULTS = {
  free: { name: "Free", price: "$0/mo" },
  business: { name: "Business", price: "$499/mo" },
};

const FALLBACK_ROWS = [
  { label: "MAU limit", free: "5", business: "200,000" },
  { label: "Stripe billing", free: "—", business: "✓" },
  { label: "Support", free: "Community", business: "Priority" },
];

export function PlanComparisonTable({
  plans,
  onUpgrade,
  isMutating,
}: PlanComparisonTableProps) {
  const free = plans.find((p) => p.id === "free");
  const business = plans.find((p) => p.id === "business");

  const freeName = free?.name ?? DEFAULTS.free.name;
  const businessName = business?.name ?? DEFAULTS.business.name;
  const freePrice = free?.base_price ?? DEFAULTS.free.price;
  const businessPrice = business?.base_price ?? DEFAULTS.business.price;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wide text-[color:var(--color-text-secondary)]">
          Compare Plans
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/2" />
              <TableHead className="text-center">{freeName}</TableHead>
              <TableHead className="text-center text-[color:var(--color-primary)]">
                {businessName}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="text-[color:var(--color-text-secondary)]">
                Cost
              </TableCell>
              <TableCell className="text-center">{freePrice}</TableCell>
              <TableCell className="text-center font-medium text-[color:var(--color-primary)]">
                {businessPrice}
              </TableCell>
            </TableRow>
            {FALLBACK_ROWS.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="text-[color:var(--color-text-secondary)]">
                  {row.label}
                </TableCell>
                <TableCell className="text-center">{row.free}</TableCell>
                <TableCell className="text-center font-medium text-[color:var(--color-primary)]">
                  {row.business}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex justify-end pt-2">
          <Button
            onClick={onUpgrade}
            disabled={isMutating || business?.purchasable === false}
          >
            Upgrade to {businessName} →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
