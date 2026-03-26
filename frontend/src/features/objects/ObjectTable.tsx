import { DownloadIcon, LoaderCircleIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import type { ObjectItem } from "@/api/types";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function ObjectTable({
  items,
  onDelete,
  onSignDownload,
  buildPublicUrl,
  deletingKey,
  signingKey,
  bucket,
}: {
  items: ObjectItem[];
  onDelete: (key: string) => Promise<void>;
  onSignDownload: (key: string) => Promise<void>;
  buildPublicUrl: (key: string) => string;
  deletingKey: string;
  signingKey: string;
  bucket: string;
}) {
  const { locale, t } = useI18n();

  return (
    <Card className="border-border/70 bg-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>{t("objects.table.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("objects.table.description")}
          </p>
        </div>
        <Badge variant="secondary">
          {t("objects.table.total", { count: items.length })}
        </Badge>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("objects.table.key")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("objects.table.size")}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("objects.table.etag")}
              </TableHead>
              <TableHead>{t("objects.table.visibility")}</TableHead>
              <TableHead className="hidden xl:table-cell">
                {t("objects.table.createdAt")}
              </TableHead>
              <TableHead className="text-right">
                {t("objects.table.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="max-w-[260px]">
                  <div className="flex flex-col gap-1">
                    <span className="truncate font-medium">{item.object_key}</span>
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {formatBytes(item.size)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {formatBytes(item.size)}
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                  {item.etag.slice(0, 12)}...
                </TableCell>
                <TableCell>
                  <Badge
                    variant={item.visibility === "public" ? "secondary" : "outline"}
                  >
                    {item.visibility === "public"
                      ? t("objects.visibility.public")
                      : t("objects.visibility.private")}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground xl:table-cell">
                  {formatDate(item.created_at, locale)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {item.visibility === "public" ? (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={buildPublicUrl(item.object_key)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <DownloadIcon data-icon="inline-start" />
                          {t("objects.actions.directDownload")}
                        </a>
                      </Button>
                    ) : (
                      <Button
                        disabled={signingKey === item.object_key}
                        onClick={() => void onSignDownload(item.object_key)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {signingKey === item.object_key ? (
                          <LoaderCircleIcon
                            className="animate-spin"
                            data-icon="inline-start"
                          />
                        ) : (
                          <DownloadIcon data-icon="inline-start" />
                        )}
                        {signingKey === item.object_key
                          ? t("objects.actions.signing")
                          : t("objects.actions.signedDownload")}
                      </Button>
                    )}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          disabled={deletingKey === item.object_key}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          {deletingKey === item.object_key ? (
                            <LoaderCircleIcon
                              className="animate-spin"
                              data-icon="inline-start"
                            />
                          ) : (
                            <Trash2Icon data-icon="inline-start" />
                          )}
                          {deletingKey === item.object_key
                            ? t("objects.actions.deleting")
                            : t("common.delete")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent size="sm">
                        <AlertDialogHeader>
                          <AlertDialogMedia>
                            <ShieldAlertIcon />
                          </AlertDialogMedia>
                          <AlertDialogTitle>{t("objects.delete.title")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("objects.delete.description", {
                              bucket,
                              objectKey: item.object_key,
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t("common.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void onDelete(item.object_key)}
                            variant="destructive"
                          >
                            {t("common.delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
