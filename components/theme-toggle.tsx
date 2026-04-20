"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  /** Button size forwarded to shadcn `<Button>`. Defaults to `sm`. */
  size?: "sm" | "default" | "icon";
};

/**
 * Simple light / dark toggle. Cycles `light` → `dark`. Defaults the UI to
 * a faint outlined button so it drops in to dashboard / admin headers.
 *
 * Falsy-safe before mount: returns a shell with the correct size so the
 * layout doesn't shift when hydration completes and `next-themes` resolves.
 */
export function ThemeToggle({ className, size = "sm" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Before mount, `resolvedTheme` is undefined on the server and the client
  // can hydrate to the configured default (dark). Keep aria-label / title /
  // the onClick target stable across that first render so React doesn't flag
  // a hydration mismatch; swap in the real label once mounted.
  const currentTheme = mounted ? resolvedTheme : undefined;
  const isDark = currentTheme === "dark";
  const label = mounted
    ? isDark
      ? "Switch to light theme"
      : "Switch to dark theme"
    : "Toggle theme";

  return (
    <Button
      type="button"
      variant="outline"
      size={size === "icon" ? "icon" : "sm"}
      aria-label={label}
      title={label}
      className={cn("gap-2", className)}
      onClick={() => {
        if (!mounted) return;
        setTheme(isDark ? "light" : "dark");
      }}
    >
      {mounted ? (
        isDark ? <Sun className="size-4" /> : <Moon className="size-4" />
      ) : (
        <span className="size-4" aria-hidden />
      )}
      {size !== "icon" ? (
        <span className="text-xs">{mounted ? (isDark ? "Light" : "Dark") : ""}</span>
      ) : null}
    </Button>
  );
}
