import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlertIcon,
  GlobeIcon,
  LoaderCircleIcon,
  PencilLineIcon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import type { CreateSiteRequest, Site } from "@/api/types";
import { listBuckets } from "@/api/buckets";
import { createSite, deleteSite, listSites, updateSite } from "@/api/sites";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/ToastProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SiteFormDialog,
  siteToSiteFormValue,
  type SiteFormValue,
} from "@/features/sites/SiteFormDialog";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";

export function SitesPage() {
  const { settings } = useAppSettings();
  const { locale, t } = useI18n();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const sitesQueryKey = ["sites", settings.apiBaseUrl, settings.bearerToken] as const;

  const sitesQuery = useQuery({
    queryKey: sitesQueryKey,
    queryFn: () => listSites(settings),
    enabled: settings.apiBaseUrl.trim() !== "",
  });

  const bucketsQuery = useQuery({
    queryKey: ["buckets", settings.apiBaseUrl, settings.bearerToken],
    queryFn: () => listBuckets(settings),
    enabled: settings.apiBaseUrl.trim() !== "",
  });

  const createSiteMutation = useMutation({
    mutationFn: (value: SiteFormValue) =>
      createSite(settings, toSiteRequest(value)),
    onSuccess: async () => {
      pushToast("success", t("toast.siteCreated"));
      await queryClient.invalidateQueries({ queryKey: sitesQueryKey });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.createSite");
      pushToast("error", message);
    },
  });

  const updateSiteMutation = useMutation({
    mutationFn: (input: { siteId: number; value: SiteFormValue }) =>
      updateSite(settings, input.siteId, toSiteRequest(input.value)),
    onSuccess: async () => {
      pushToast("success", t("toast.siteUpdated"));
      await queryClient.invalidateQueries({ queryKey: sitesQueryKey });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.updateSite");
      pushToast("error", message);
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: (siteId: number) => deleteSite(settings, siteId),
    onSuccess: async () => {
      pushToast("success", t("toast.siteDeleted"));
      await queryClient.invalidateQueries({ queryKey: sitesQueryKey });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.deleteSite");
      pushToast("error", message);
    },
  });

  const sites = sitesQuery.data?.items ?? [];
  const buckets = bucketsQuery.data?.items ?? [];
  const loading = sitesQuery.isLoading || bucketsQuery.isLoading;

  async function handleCreateSite(value: SiteFormValue) {
    await createSiteMutation.mutateAsync(value);
  }

  async function handleUpdateSite(siteId: number, value: SiteFormValue) {
    await updateSiteMutation.mutateAsync({ siteId, value });
  }

  async function handleDeleteSite(siteId: number) {
    await deleteSiteMutation.mutateAsync(siteId);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("sites.title")}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t("sites.description")}
          </p>
        </div>

        <SiteFormDialog
          buckets={buckets}
          description={t("sites.form.createDescription")}
          mode="create"
          onSubmit={handleCreateSite}
          pending={createSiteMutation.isPending}
          title={t("sites.form.createTitle")}
          trigger={
            <Button
              disabled={bucketsQuery.isLoading || buckets.length === 0}
              type="button"
            >
              <PlusIcon data-icon="inline-start" />
              {t("sites.actions.create")}
            </Button>
          }
        />
      </div>

      {sitesQuery.isError ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t("errors.loadSites")}</AlertTitle>
          <AlertDescription>{sitesQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {bucketsQuery.isError ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t("errors.loadBuckets")}</AlertTitle>
          <AlertDescription>{bucketsQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border/70 bg-card py-0">
        <CardHeader className="border-b border-border/70 py-4">
          <CardTitle>{t("sites.list.title")}</CardTitle>
          <CardDescription>
            {t("sites.list.description")}
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{t("sites.list.total", { count: sites.length })}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center p-4">
              <LoaderCircleIcon className="animate-spin text-muted-foreground" />
            </div>
          ) : sites.length === 0 ? (
            <div className="p-6">
              <EmptyState
                description={t("sites.list.empty")}
                icon={GlobeIcon}
                title={t("sites.list.title")}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-base font-semibold text-muted-foreground">
                    {t("sites.table.domains")}
                  </TableHead>
                  <TableHead className="text-base font-semibold text-muted-foreground">
                    {t("sites.table.bucket")}
                  </TableHead>
                  <TableHead className="text-base font-semibold text-muted-foreground">
                    {t("sites.table.rootPrefix")}
                  </TableHead>
                  <TableHead className="text-base font-semibold text-muted-foreground">
                    {t("sites.table.enabled")}
                  </TableHead>
                  <TableHead className="text-base font-semibold text-muted-foreground">
                    {t("sites.table.indexDocument")}
                  </TableHead>
                  <TableHead className="text-base font-semibold text-muted-foreground">
                    {t("sites.table.spaFallback")}
                  </TableHead>
                  <TableHead className="text-base font-semibold text-muted-foreground">
                    {t("sites.table.updatedAt")}
                  </TableHead>
                  <TableHead className="text-base font-semibold text-muted-foreground">
                    {t("sites.table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell className="max-w-[320px] whitespace-normal break-all">
                      {site.domains.join(", ")}
                    </TableCell>
                    <TableCell>{site.bucket}</TableCell>
                    <TableCell>
                      {site.root_prefix || t("explorer.rootFolder")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={site.enabled ? "secondary" : "outline"}>
                        {site.enabled ? t("common.enabled") : t("common.disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell>{site.index_document}</TableCell>
                    <TableCell>
                      <Badge variant={site.spa_fallback ? "secondary" : "outline"}>
                        {site.spa_fallback
                          ? t("common.enabled")
                          : t("common.disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(site.updated_at, locale)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <SiteFormDialog
                          buckets={buckets}
                          description={t("sites.form.editDescription")}
                          initialValue={siteToSiteFormValue(site)}
                          mode="edit"
                          onSubmit={(value) => handleUpdateSite(site.id, value)}
                          pending={updateSiteMutation.isPending}
                          title={t("sites.form.editTitle")}
                          trigger={
                            <Button size="sm" type="button" variant="outline">
                              <PencilLineIcon data-icon="inline-start" />
                              {t("common.edit")}
                            </Button>
                          }
                        />
                        <DeleteSiteButton
                          onDelete={handleDeleteSite}
                          pending={deleteSiteMutation.isPending}
                          site={site}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function DeleteSiteButton({
  onDelete,
  pending,
  site,
}: {
  onDelete: (siteId: number) => Promise<void>;
  pending: boolean;
  site: Site;
}) {
  const { t } = useI18n();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Trash2Icon data-icon="inline-start" />
          {t("common.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ShieldAlertIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{t("sites.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("sites.delete.description", {
              domain: site.domains[0] ?? site.bucket,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void onDelete(site.id)}
            variant="destructive"
          >
            {pending ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : null}
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function toSiteRequest(value: SiteFormValue): CreateSiteRequest {
  return {
    bucket: value.bucket,
    root_prefix: value.rootPrefix,
    enabled: value.enabled,
    index_document: value.indexDocument,
    error_document: value.errorDocument,
    spa_fallback: value.spaFallback,
    domains: value.domains,
  };
}
