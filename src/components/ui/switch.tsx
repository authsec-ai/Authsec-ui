import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "../../lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-focus-ring) disabled:cursor-not-allowed disabled:opacity-50",
      "border border-solid",
      "data-[state=checked]:bg-(--color-primary) data-[state=checked]:border-(--color-primary)",
      "data-[state=unchecked]:bg-(--color-surface-subtle) data-[state=unchecked]:border-(--color-border-strong)",
      "hover:data-[state=checked]:bg-(--color-primary-strong) hover:data-[state=unchecked]:border-(--color-text-subtle)",
      "after:content-[''] after:absolute after:top-[-16px] after:left-[-16px] after:right-[-16px] after:bottom-[-16px] after:pointer-events-none",
      "relative",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block rounded-full",
        "h-[18px] w-[18px]",
        "border border-solid",
        "shadow-md",
        "transition-transform duration-100",
        "data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[2px]",
        "data-[state=checked]:bg-white data-[state=checked]:border-white",
        "data-[state=checked]:scale-110",
        "data-[state=unchecked]:bg-white data-[state=unchecked]:border-(--color-border-strong)"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
