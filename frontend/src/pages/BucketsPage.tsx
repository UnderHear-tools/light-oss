import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBucket, listBuckets } from "../api/buckets";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/ToastProvider";
import { BucketList } from "../features/buckets/BucketList";
import { CreateBucketForm } from "../features/buckets/CreateBucketForm";
import { useAppSettings } from "../lib/settings";

export function BucketsPage() {
  const { settings } = useAppSettings();
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
      pushToast("success", "Bucket created");
      await queryClient.invalidateQueries({
        queryKey: ["buckets", settings.apiBaseUrl, settings.bearerToken],
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to create bucket";
      pushToast("error", message);
    },
  });

  async function handleCreateBucket(name: string) {
    await createBucketMutation.mutateAsync(name);
  }

  return (
    <section className="page-grid">
      <CreateBucketForm
        onSubmit={handleCreateBucket}
        pending={createBucketMutation.isPending}
      />
      {bucketsQuery.isLoading ? (
        <div className="panel">Loading buckets...</div>
      ) : null}
      {bucketsQuery.isError ? (
        <div className="panel">Load failed: {bucketsQuery.error.message}</div>
      ) : null}
      {bucketsQuery.data && bucketsQuery.data.items.length > 0 ? (
        <BucketList buckets={bucketsQuery.data.items} />
      ) : null}
      {bucketsQuery.data && bucketsQuery.data.items.length === 0 ? (
        <EmptyState
          title="No buckets yet"
          description="Create a bucket first, then open the object manager."
        />
      ) : null}
    </section>
  );
}
