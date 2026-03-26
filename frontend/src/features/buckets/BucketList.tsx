import { ArrowUpRightIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { Bucket } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateBucketDialog } from "@/features/buckets/CreateBucketForm";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function BucketList({
  buckets,
  createPending,
  loading = false,
  onCreateBucket,
}: {
  buckets: Bucket[];
  createPending: boolean;
  loading?: boolean;
  onCreateBucket: (name: string) => Promise<void>;
}) {
  const { locale, t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">
            {t("buckets.list.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("buckets.list.description", { count: buckets.length })}
          </p>
        </div>
        <Badge variant="secondary">
          {t("buckets.list.total", { count: buckets.length })}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CreateBucketDialog
          onSubmit={onCreateBucket}
          pending={createPending}
        />

        {buckets.map((bucket) => (
          <Card className="border-border/70 bg-card" key={bucket.id}>
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
            <CardFooter>
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
