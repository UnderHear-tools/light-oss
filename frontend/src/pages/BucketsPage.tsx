import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import type { Site } from "@/api/types";
import { createBucket, deleteBucket, listBuckets } from "@/api/buckets";
import { listSites } from "@/api/sites";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ToastProvider";
import { BucketList } from "@/features/buckets/BucketList";
import { useI18n } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";

export function BucketsPage() {
  const { settings } = useAppSettings();
  const { t } = useI18n();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [deletingBucketName, setDeletingBucketName] = useState("");
  const bucketsQueryKey = [
    "buckets",
    settings.apiBaseUrl,
    settings.bearerToken,
  ] as const;
  const sitesQueryKey = [
    "sites",
    settings.apiBaseUrl,
    settings.bearerToken,
  ] as const;

  const bucketsQuery = useQuery({
    queryKey: bucketsQueryKey,
    queryFn: () => listBuckets(settings),
    enabled: settings.apiBaseUrl.trim() !== "",
  });

  const sitesQuery = useQuery({
    queryKey: sitesQueryKey,
    queryFn: () => listSites(settings),
    enabled: settings.apiBaseUrl.trim() !== "",
  });

  const createBucketMutation = useMutation({
    mutationFn: (name: string) => createBucket(settings, name),
    onSuccess: async () => {
      pushToast("success", t("toast.bucketCreated"));
      await queryClient.invalidateQueries({ queryKey: bucketsQueryKey });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.createBucket");
      pushToast("error", message);
    },
  });

  const deleteBucketMutation = useMutation({
    mutationFn: async (bucketName: string) => {
      setDeletingBucketName(bucketName);
      await deleteBucket(settings, bucketName);
    },
    onSuccess: async (_, bucketName) => {
      queryClient.removeQueries({
        queryKey: [
          "explorer-entries",
          settings.apiBaseUrl,
          settings.bearerToken,
          bucketName,
        ],
      });
      pushToast("success", t("toast.bucketDeleted"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: bucketsQueryKey }),
        queryClient.invalidateQueries({ queryKey: sitesQueryKey }),
      ]);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.deleteBucket");
      pushToast("error", message);
    },
    onSettled: () => {
      setDeletingBucketName("");
    },
  });

  async function handleCreateBucket(name: string) {
    await createBucketMutation.mutateAsync(name);
  }

  async function handleDeleteBucket(bucketName: string) {
    await deleteBucketMutation.mutateAsync(bucketName);
  }

  const buckets = bucketsQuery.data?.items ?? [];
  const sites = sitesQuery.data?.items ?? [];
  const sitesByBucket: Record<string, Site[]> = {};

  for (const site of sites) {
    if (!sitesByBucket[site.bucket]) {
      sitesByBucket[site.bucket] = [];
    }
    sitesByBucket[site.bucket].push(site);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("buckets.title")}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t("buckets.description")}
          </p>
        </div>
      </div>

      {bucketsQuery.isError ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t("errors.loadBuckets")}</AlertTitle>
          <AlertDescription>{bucketsQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {sitesQuery.isError ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t("errors.loadSites")}</AlertTitle>
          <AlertDescription>{sitesQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <BucketList
        buckets={buckets}
        createPending={createBucketMutation.isPending}
        deleteDisabled={sitesQuery.isLoading || sitesQuery.isError}
        deletePendingBucket={deletingBucketName}
        loading={bucketsQuery.isLoading}
        onCreateBucket={handleCreateBucket}
        onDeleteBucket={handleDeleteBucket}
        sitesByBucket={sitesByBucket}
      />
    </section>
  );
}
