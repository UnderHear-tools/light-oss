import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BoxesIcon, CircleAlertIcon } from "lucide-react";
import { createBucket, listBuckets } from "@/api/buckets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ToastProvider";
import { BucketList } from "@/features/buckets/BucketList";
import { useI18n } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";

export function BucketsPage() {
  const { settings } = useAppSettings();
  const { t } = useI18n();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const bucketsQuery = useQuery({
    queryKey: ["buckets", settings.apiBaseUrl, settings.bearerToken],
    queryFn: () => listBuckets(settings),
    enabled: settings.apiBaseUrl.trim() !== "",
  });

  const createBucketMutation = useMutation({
    mutationFn: (name: string) => createBucket(settings, name),
    onSuccess: async () => {
      pushToast("success", t("toast.bucketCreated"));
      await queryClient.invalidateQueries({
        queryKey: ["buckets", settings.apiBaseUrl, settings.bearerToken],
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.createBucket");
      pushToast("error", message);
    },
  });

  async function handleCreateBucket(name: string) {
    await createBucketMutation.mutateAsync(name);
  }

  const buckets = bucketsQuery.data?.items ?? [];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Badge className="w-fit gap-1.5" variant="outline">
            <BoxesIcon className="size-3.5" />
            {t("buckets.title")}
          </Badge>
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

      <BucketList
        buckets={buckets}
        createPending={createBucketMutation.isPending}
        loading={bucketsQuery.isLoading}
        onCreateBucket={handleCreateBucket}
      />
    </section>
  );
}
