import { useQuery } from "@tanstack/react-query";
import {
  BoxesIcon,
  CircleAlertIcon,
  Clock3Icon,
  LayoutDashboardIcon,
  ServerCogIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { listBuckets } from "@/api/buckets";
import { StatCard } from "@/components/StatCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getApiHostLabel, hasBearerToken } from "@/lib/connection";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";

export function ConsolePage() {
  const { settings } = useAppSettings();
  const { locale, t } = useI18n();

  const bucketsQuery = useQuery({
    queryKey: ["buckets", settings.apiBaseUrl, settings.bearerToken],
    queryFn: () => listBuckets(settings),
    enabled: settings.apiBaseUrl.trim() !== "",
  });

  const buckets = bucketsQuery.data?.items ?? [];
  const latestBucket = buckets.reduce<(typeof buckets)[number] | null>(
    (latest, current) => {
      if (!latest) {
        return current;
      }

      return new Date(current.updated_at).getTime() >
        new Date(latest.updated_at).getTime()
        ? current
        : latest;
    },
    null,
  );
  const host = getApiHostLabel(settings.apiBaseUrl);
  const tokenConfigured = hasBearerToken(settings.bearerToken);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-2">
          <Badge className="w-fit gap-1.5" variant="outline">
            <LayoutDashboardIcon className="size-3.5" />
            {t("console.title")}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("console.title")}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t("console.description")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className="gap-1.5" variant="secondary">
            <ServerCogIcon className="size-3.5" />
            {host}
          </Badge>
          <Badge
            className="gap-1.5"
            variant={tokenConfigured ? "secondary" : "outline"}
          >
            <ShieldCheckIcon className="size-3.5" />
            {tokenConfigured
              ? t("header.authConfigured")
              : t("header.authMissing")}
          </Badge>
        </div>
      </div>

      {bucketsQuery.isError ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t("errors.loadBuckets")}</AlertTitle>
          <AlertDescription>{bucketsQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard
          description={t("buckets.list.total", { count: buckets.length })}
          icon={BoxesIcon}
          title={t("buckets.overview.totalBuckets")}
          value={String(buckets.length)}
        />
        <StatCard
          description={settings.apiBaseUrl.trim() || t("common.notAvailable")}
          icon={ServerCogIcon}
          title={t("buckets.overview.apiHost")}
          value={host}
        />
        <StatCard
          description={t("header.connection")}
          icon={ShieldCheckIcon}
          title={t("buckets.overview.authStatus")}
          value={
            tokenConfigured ? t("common.configured") : t("common.missing")
          }
        />
        <StatCard
          description={
            latestBucket
              ? latestBucket.name
              : t("buckets.overview.emptyTimestamp")
          }
          icon={Clock3Icon}
          title={t("buckets.overview.latestBucket")}
          value={
            latestBucket
              ? formatDate(latestBucket.updated_at, locale)
              : t("common.noData")
          }
        />
      </div>

      <Card className="border-border/70 bg-card">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("header.connection")}</p>
            <Badge variant="outline">
              {tokenConfigured
                ? t("common.configured")
                : t("common.missing")}
            </Badge>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted px-3 py-3 text-sm text-muted-foreground">
            {host}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
