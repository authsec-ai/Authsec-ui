import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

export interface AuthSplitFrameProps {
  valuePanel: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  valuePanelClassName?: string;
  actionPanelClassName?: string;
  shellVariant?: "default" | "enduser-single-card";
}

export function AuthSplitFrame({
  valuePanel,
  children,
  className,
  valuePanelClassName,
  actionPanelClassName,
  shellVariant = "default",
}: AuthSplitFrameProps) {
  const { setTheme, theme } = useTheme();
  const previousThemeRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const previousColorScheme = document.documentElement.style.colorScheme;
    previousThemeRef.current = theme;

    setTheme("light");
    document.documentElement.style.colorScheme = "light";

    return () => {
      document.documentElement.style.colorScheme = previousColorScheme;

      if (previousThemeRef.current && previousThemeRef.current !== "light") {
        setTheme(previousThemeRef.current);
      }
    };
  }, [setTheme]);

  return (
    <div
      className={cn(
        "auth-shell",
        shellVariant === "enduser-single-card" && "auth-shell--enduser-single-card",
        className,
      )}
    >
      <div className="auth-shell__stage">
        <div className="auth-shell__grid">
          <aside className={cn("auth-shell__value", valuePanelClassName)}>
            {valuePanel}
          </aside>
          <section className={cn("auth-shell__action", actionPanelClassName)}>
            {children}
          </section>
        </div>
      </div>
    </div>
  );
}

export default AuthSplitFrame;
