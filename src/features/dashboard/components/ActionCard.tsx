import React from "react";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/card";

const iconColors = {
  purple:
    "bg-blue-500/10 text-blue-600 dark:bg-blue-400/20 dark:text-blue-400",
  blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-400/20 dark:text-blue-400",
  green:
    "bg-green-500/10 text-green-600 dark:bg-green-400/20 dark:text-green-400",
  amber:
    "bg-amber-500/10 text-amber-600 dark:bg-amber-400/20 dark:text-amber-400",
  neutral: "bg-[var(--color-surface-subtle)] text-foreground opacity-60",
};

interface ActionCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
  badge?: string;
  badgeColor?: "success" | "warning" | "info" | "default";
  color?: "purple" | "blue" | "green" | "amber" | "neutral";
  disabled?: boolean;
}

export function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  color = "neutral",
  disabled = false,
}: ActionCardProps) {
  const iconStyle = iconColors[color];

  return (
    <Card
      className={`group h-full dash-panel ${
        disabled
          ? "opacity-55 cursor-not-allowed"
          : "dash-panel-interactive cursor-pointer"
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <CardContent className="p-5 flex flex-col h-full">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2.5 rounded-[var(--dash-radius-md)] border border-[var(--dash-border-soft)] ${iconStyle}`}>
            <Icon className="h-5 w-5" />
          </div>
          {/* {badge && (
            <Badge
              variant="outline"
              className={`text-xs ${badgeVariants[badgeColor]}`}
            >
              {badge}
            </Badge>
          )} */}
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-foreground opacity-50 leading-relaxed flex-1 line-clamp-2">
          {description}
        </p>
        {!disabled && (
          <div className="mt-3 flex justify-end">
            <ArrowRight className="h-4 w-4 dash-text-2 opacity-0 group-hover:opacity-60 transition-opacity" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
