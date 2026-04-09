import { useQuery } from "@tanstack/react-query";
import { getHealthStatus } from "@/api/health";
import {
  resolveConnectionHealthStates,
  type ConnectionHealthBadgeState,
  type ConnectionHealthStates,
} from "@/lib/health";
import { useI18n } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export function ConnectionHealthStatus({
  className,
  states,
}: {
  className?: string;
  states?: ConnectionHealthStates;
}) {
  const { settings } = useAppSettings();
  const { t } = useI18n();
  const apiBaseUrl = settings.apiBaseUrl.trim();

  const healthQuery = useQuery({
    queryKey: ["healthz", settings.apiBaseUrl, settings.bearerToken],
    queryFn: () => getHealthStatus(settings),
    enabled: states === undefined && apiBaseUrl !== "",
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const resolvedStates =
    states ??
    resolveConnectionHealthStates({
      isConfigured: apiBaseUrl !== "",
      isPending: healthQuery.isPending,
      error: healthQuery.error,
      data: healthQuery.data,
    });

  return (
    <div className={cn("flex flex-wrap items-center gap-4 text-sm font-medium", className)}>
      <div className={cn("flex items-center gap-1.5", getStatusTextClassName(resolvedStates.service))}>
        <HealthStatusDot state={resolvedStates.service} />
        <span>
          {t("health.service")} {getHealthStateLabel(t, resolvedStates.service)}
        </span>
      </div>
      <div className={cn("flex items-center gap-1.5", getStatusTextClassName(resolvedStates.database))}>
        <HealthStatusDot state={resolvedStates.database} />
        <span>
          {t("health.database")} {getHealthStateLabel(t, resolvedStates.database)}
        </span>
      </div>
    </div>
  );
}

function getStatusTextClassName(state: ConnectionHealthBadgeState) {
  switch (state) {
    case "ok":
      return "text-emerald-700 dark:text-emerald-400";
    case "error":
    case "token_error":
    case "unreachable":
    case "unknown":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-muted-foreground";
  }
}

function HealthStatusDot({ state }: { state: ConnectionHealthBadgeState }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-2.5 shrink-0", getDotClassName(state))}
      viewBox="0 0 12 12"
    >
      <circle cx="6" cy="6" fill="currentColor" r="5" />
    </svg>
  );
}

function getDotClassName(state: ConnectionHealthBadgeState) {
  switch (state) {
    case "ok":
      return "text-emerald-500";
    case "error":
    case "token_error":
    case "unreachable":
    case "unknown":
      return "text-red-500";
    default:
      return "text-muted-foreground/70";
  }
}

function getHealthStateLabel(
  t: ReturnType<typeof useI18n>["t"],
  state: ConnectionHealthBadgeState,
) {
  switch (state) {
    case "ok":
      return t("health.state.ok");
    case "error":
      return t("health.state.error");
    case "token_error":
      return t("health.state.tokenError");
    case "checking":
      return t("health.state.checking");
    case "unconfigured":
      return t("health.state.unconfigured");
    case "unreachable":
      return t("health.state.unreachable");
    case "unknown":
      return t("health.state.unknown");
  }
}
