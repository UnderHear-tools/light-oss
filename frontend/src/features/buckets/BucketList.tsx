import { useId, useState } from "react";
import {
  ArrowUpRightIcon,
  HardDriveIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Bucket, Site } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateBucketDialog } from "@/features/buckets/CreateBucketForm";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function BucketList({
  buckets,
  createPending,
  deleteDisabled,
  deletePendingBucket,
  loading = false,
  onCreateBucket,
  onDeleteBucket,
  sitesByBucket,
}: {
  buckets: Bucket[];
  createPending: boolean;
  deleteDisabled: boolean;
  deletePendingBucket: string;
  loading?: boolean;
  onCreateBucket: (name: string) => Promise<void>;
  onDeleteBucket: (bucketName: string) => Promise<void>;
  sitesByBucket: Record<string, Site[]>;
}) {
  const { locale, t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">
            {t("buckets.list.title")}
          </h2>
          <Badge className="w-fit" variant="secondary">
            {t("buckets.list.total", { count: buckets.length })}
          </Badge>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5">
        <CreateBucketDialog
          onSubmit={onCreateBucket}
          pending={createPending}
        />
        {buckets.map((bucket) => (
          <Card
            className="relative overflow-hidden border-border/70 bg-card"
            key={bucket.id}
          >
            <HardDriveIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2 size-36 -translate-y-2/3 text-muted-foreground/10"
            />
            <CardHeader className="flex flex-col gap-3">
              <CardTitle className="text-2xl leading-tight break-all">
                <Link className="hover:underline" to={`/buckets/${bucket.name}`}>
                  {bucket.name}
                </Link>
              </CardTitle>
              <CardDescription>{t("buckets.list.openHint")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("buckets.table.createdAt")}
                </span>
                <span className="text-sm">{formatDate(bucket.created_at, locale)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("buckets.table.updatedAt")}
                </span>
                <span className="text-sm">{formatDate(bucket.updated_at, locale)}</span>
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <DeleteBucketButton
                bucket={bucket}
                disabled={deleteDisabled || deletePendingBucket !== ""}
                onDelete={onDeleteBucket}
                pending={deletePendingBucket === bucket.name}
                sites={sitesByBucket[bucket.name] ?? []}
              />
              <Button asChild size="sm" variant="outline">
                <Link to={`/buckets/${bucket.name}`}>
                  <ArrowUpRightIcon data-icon="inline-start" />
                  {t("common.open")}
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
        {loading
          ? Array.from({ length: 5 }).map((_, index) => (
              <Card className="border-border/70 bg-card" key={`skeleton-${index}`}>
                <CardContent className="flex flex-col gap-4 p-6">
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-7 w-36" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-24" />
                </CardContent>
              </Card>
            ))
          : null}
      </div>
    </div>
  );
}

function DeleteBucketButton({
  bucket,
  disabled,
  onDelete,
  pending,
  sites,
}: {
  bucket: Bucket;
  disabled: boolean;
  onDelete: (bucketName: string) => Promise<void>;
  pending: boolean;
  sites: Site[];
}) {
  const [confirmationValue, setConfirmationValue] = useState("");
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const inputId = useId();
  const isMatch = confirmationValue.trim() === bucket.name;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setConfirmationValue("");
  }

  async function handleDelete() {
    if (!isMatch) {
      return;
    }

    try {
      await onDelete(bucket.name);
      setOpen(false);
    } catch {
      // Mutation error state is handled by the page-level toast.
    }
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} size="sm" type="button" variant="outline">
          <Trash2Icon data-icon="inline-start" />
          {t("common.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ShieldAlertIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{t("buckets.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("buckets.delete.description", { bucket: bucket.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {sites.length > 0 ? (
          <div className="grid gap-2">
            <div className="text-sm font-medium">{t("buckets.delete.sitesTitle")}</div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="grid gap-3">
                {sites.map((site) => (
                  <div className="grid gap-1 text-sm" key={site.id}>
                    <div>
                      {t("sites.table.rootPrefix")}:{" "}
                      {site.root_prefix || t("explorer.rootFolder")}
                    </div>
                    <div>
                      {t("sites.table.domains")}:{" "}
                      {site.domains.join(", ") || t("common.noData")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor={inputId}>
            {t("buckets.delete.confirmLabel")}
          </label>
          <Input
            autoComplete="off"
            id={inputId}
            onChange={(event) => setConfirmationValue(event.target.value)}
            placeholder={t("buckets.delete.confirmPlaceholder")}
            value={confirmationValue}
          />
          <p className="text-sm text-muted-foreground">
            {t("buckets.delete.confirmDescription", { bucket: bucket.name })}
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <Button
            disabled={!isMatch || pending}
            onClick={() => void handleDelete()}
            type="button"
            variant="destructive"
          >
            {pending ? (
              <LoaderCircleIcon
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : null}
            {pending
              ? t("buckets.delete.submitting")
              : t("buckets.delete.submit")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
