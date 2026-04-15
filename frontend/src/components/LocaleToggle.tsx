import { GlobeIcon } from "@primer/octicons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  preferenceToggleTriggerClassName,
  type PreferenceToggleSize,
} from "@/components/preference-toggle";
import { cn } from "@/lib/utils";
import { useAppPreferences, type AppLocale } from "@/lib/preferences";
import { useI18n } from "@/lib/i18n";

const localeOptions: Array<{ value: AppLocale; label: string }> = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
];

export function LocaleToggle({
  className,
  dropdownClassName,
  size = "sm",
}: {
  className?: string;
  dropdownClassName?: string;
  size?: PreferenceToggleSize;
}) {
  const {
    preferences: { locale },
    setLocale,
  } = useAppPreferences();
  const { t } = useI18n();
  const currentLocaleLabel = locale === "zh-CN" ? t("locale.zh") : t("locale.en");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("header.compactLanguageSwitch")}
        className={cn(
          preferenceToggleTriggerClassName(size),
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
          className,
        )}
        type="button"
      >
        <GlobeIcon className="size-4 shrink-0" />
        <span className="leading-none">{currentLocaleLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn("min-w-28", dropdownClassName)}
        sideOffset={8}
      >
        {localeOptions.map((option) => (
          <DropdownMenuItem
            className="cursor-pointer"
            key={option.value}
            onSelect={() => setLocale(option.value)}
          >
            <span
              className={cn(
                "w-full",
                locale === option.value && "font-medium text-foreground",
              )}
            >
              {option.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
