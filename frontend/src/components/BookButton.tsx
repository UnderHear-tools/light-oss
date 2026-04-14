import { BookIcon } from "@primer/octicons-react";
import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  preferenceToggleTriggerClassName,
  type PreferenceToggleSize,
} from "@/components/preference-toggle";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type BookButtonProps = ComponentPropsWithoutRef<"button"> & {
  size?: PreferenceToggleSize;
};

export function BookButton({
  className,
  onClick,
  size = "sm",
  type = "button",
  ...props
}: BookButtonProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (!event.defaultPrevented) {
      navigate("/docs");
    }
  }

  return (
    <button
      aria-label={t("header.docs")}
      className={cn(preferenceToggleTriggerClassName(size), className)}
      onClick={handleClick}
      type={type}
      {...props}
    >
      <BookIcon className="size-4 shrink-0" />
      <span className="leading-none">{t("header.docs")}</span>
    </button>
  );
}
