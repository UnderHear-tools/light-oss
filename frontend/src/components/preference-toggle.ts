import { cn } from "@/lib/utils";

export type PreferenceToggleSize = "sm" | "default";

export function preferenceToggleTriggerClassName(size: PreferenceToggleSize) {
  return cn(
    "inline-flex items-center justify-center rounded-md border-0 bg-transparent font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer",
    size === "default" ? "h-10 gap-2 px-3 text-sm" : "h-8 gap-1.5 px-2.5 text-xs",
  );
}
