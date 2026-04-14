import { MoonIcon, SunIcon } from "@primer/octicons-react";
import {
  preferenceToggleTriggerClassName,
  type PreferenceToggleSize,
} from "@/components/preference-toggle";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/preferences";
import { useI18n } from "@/lib/i18n";

export function ThemeToggle({
  className,
  size = "sm",
}: {
  className?: string;
  size?: PreferenceToggleSize;
}) {
  const {
    preferences: { theme },
    setTheme,
  } = useAppPreferences();
  const { t } = useI18n();
  const currentThemeLabel = theme === "light" ? t("theme.light") : t("theme.dark");
  const Icon = theme === "light" ? SunIcon : MoonIcon;

  return (
    <button
      aria-label={t("header.compactThemeSwitch")}
      className={cn(
        preferenceToggleTriggerClassName(size),
        className,
      )}
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      type="button"
    >
      <Icon className="size-4 shrink-0" />
      <span className="leading-none">{currentThemeLabel}</span>
    </button>
  );
}
