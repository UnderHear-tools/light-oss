import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestoreIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  RefreshCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  deleteRecycleBinObjects,
  listRecycleBinObjects,
  restoreRecycleBinObjects,
} from "@/api/objects";
import type {
  RecycleBinObjectItem,
  RecycleBinObjectListResult,
} from "@/api/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";
import { toast } from "sonner";

const recycleBinPageSize = 20;
const emptyRecycleBinItems: RecycleBinObjectItem[] = [];

export function RecycleBinDialog({ bucketName }: { bucketName: string }) {
  const { settings } = useAppSettings();
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [pendingRestoreItems, setPendingRestoreItems] = useState<
    RecycleBinObjectItem[]
  >([]);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [pendingDeleteItems, setPendingDeleteItems] = useState<
    RecycleBinObjectItem[]
  >([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const recycleBinBaseQueryKey = [
    "recycle-bin-objects",
    settings.apiBaseUrl,
    settings.bearerToken,
    bucketName,
  ] as const;
  const recycleBinQueryKey = [...recycleBinBaseQueryKey, cursor] as const;
  const showBucketColumn = bucketName.trim() === "";
  const tableMinWidthClass = showBucketColumn
    ? "min-w-[70rem]"
    : "min-w-[62rem]";

  const recycleBinQuery = useQuery({
    queryKey: recycleBinQueryKey,
    queryFn: () =>
      listRecycleBinObjects(settings, {
        bucket: bucketName,
        limit: recycleBinPageSize,
        cursor,
      }),
    enabled:
      open && settings.apiBaseUrl.trim() !== "" && bucketName.trim() !== "",
  });

  const items = recycleBinQuery.data?.items ?? emptyRecycleBinItems;

  useEffect(() => {
    setCursor("");
    setCursorHistory([]);
    setSelectedIds(new Set());
    setPendingRestoreItems([]);
    setRestoreDialogOpen(false);
    setPendingDeleteItems([]);
    setDeleteDialogOpen(false);
  }, [bucketName]);

  useEffect(() => {
    setSelectedIds((current) => {
      const visibleIDs = new Set(items.map((item) => item.id));
      let changed = false;
      const next = new Set<number>();

      current.forEach((itemID) => {
        if (visibleIDs.has(itemID)) {
          next.add(itemID);
          return;
        }

        changed = true;
      });

      return changed ? next : current;
    });
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );
  const selectedCount = selectedItems.length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const partiallySelected = selectedCount > 0 && selectedCount < items.length;

  const restoreMutation = useMutation({
    mutationFn: async (targetItems: RecycleBinObjectItem[]) => {
      const result = await restoreRecycleBinObjects(
        settings,
        targetItems.map((item) => item.id),
      );
      return { targetItems, result };
    },
    onSuccess: async ({ targetItems, result }) => {
      const failedIDs = new Set(result.failed_items.map((item) => item.id));
      const restoredItems = targetItems.filter(
        (item) => !failedIDs.has(item.id),
      );

      setRestoreDialogOpen(false);
      setPendingRestoreItems([]);
      setSelectedIds((current) => {
        if (current.size === 0) {
          return current;
        }

        const next = new Set(current);
        restoredItems.forEach((item) => next.delete(item.id));
        return next;
      });

      if (result.failed_count === 0) {
        toast.success(
          t("toast.recycleBin.restored", {
            count: result.restored_count,
          }),
        );
      } else {
        toast.error(
          t("toast.recycleBin.restorePartial", {
            successCount: result.restored_count,
            failedCount: result.failed_count,
          }),
        );
      }

      removeRecycleBinItemsFromCache(
        queryClient,
        recycleBinBaseQueryKey,
        restoredItems,
      );
      await invalidateAffectedQueries(queryClient, settings, restoredItems);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.recycleBin.restore");
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (targetItems: RecycleBinObjectItem[]) => {
      const result = await deleteRecycleBinObjects(
        settings,
        targetItems.map((item) => item.id),
      );
      return { targetItems, result };
    },
    onSuccess: async ({ targetItems, result }) => {
      const failedIDs = new Set(result.failed_items.map((item) => item.id));
      const deletedItems = targetItems.filter(
        (item) => !failedIDs.has(item.id),
      );

      setDeleteDialogOpen(false);
      setPendingDeleteItems([]);
      setSelectedIds((current) => {
        if (current.size === 0) {
          return current;
        }

        const next = new Set(current);
        deletedItems.forEach((item) => next.delete(item.id));
        return next;
      });

      if (result.failed_count === 0) {
        toast.success(
          t("toast.recycleBin.deleted", {
            count: result.deleted_count,
          }),
        );
      } else {
        toast.error(
          t("toast.recycleBin.deletePartial", {
            successCount: result.deleted_count,
            failedCount: result.failed_count,
          }),
        );
      }

      await invalidateAffectedQueries(queryClient, settings, deletedItems);
      await queryClient.invalidateQueries({ queryKey: recycleBinBaseQueryKey });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.recycleBin.delete");
      toast.error(message);
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      return;
    }

    setCursor("");
    setCursorHistory([]);
    setSelectedIds(new Set());
    setPendingRestoreItems([]);
    setRestoreDialogOpen(false);
    setPendingDeleteItems([]);
    setDeleteDialogOpen(false);
  }

  function handleSelectAll(checked: boolean | "indeterminate") {
    setSelectedIds(
      checked === true ? new Set(items.map((item) => item.id)) : new Set(),
    );
  }

  function handleSelectRow(itemID: number, checked: boolean | "indeterminate") {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (checked === true) {
        next.add(itemID);
      } else {
        next.delete(itemID);
      }

      return next;
    });
  }

  function handleNextPage() {
    if (!recycleBinQuery.data?.next_cursor) {
      return;
    }

    setCursorHistory((history) => [...history, cursor]);
    setCursor(recycleBinQuery.data.next_cursor);
  }

  function handlePrevPage() {
    if (cursorHistory.length === 0) {
      return;
    }

    const nextHistory = [...cursorHistory];
    const previousCursor = nextHistory.pop() ?? "";
    setCursorHistory(nextHistory);
    setCursor(previousCursor);
  }

  function openRestoreConfirmation(targetItems: RecycleBinObjectItem[]) {
    setPendingRestoreItems(targetItems);
    setRestoreDialogOpen(true);
  }

  function openDeleteConfirmation(targetItems: RecycleBinObjectItem[]) {
    setPendingDeleteItems(targetItems);
    setDeleteDialogOpen(true);
  }

  async function handleRestore() {
    if (pendingRestoreItems.length === 0) {
      return;
    }

    await restoreMutation.mutateAsync(pendingRestoreItems);
  }

  async function handleDelete() {
    if (pendingDeleteItems.length === 0) {
      return;
    }

    await deleteMutation.mutateAsync(pendingDeleteItems);
  }

  const actionsPending = restoreMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            <Trash2Icon />
            {t("buckets.recycleBin.open")}
          </Button>
        </DialogTrigger>
        <DialogContent className="h-[min(88vh,48rem)] w-[min(96vw,72rem)] max-w-none overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("buckets.recycleBin.title")}</DialogTitle>
            <DialogDescription>
              {t("buckets.recycleBin.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {recycleBinQuery.isError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {recycleBinQuery.error.message}
              </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/70">
              {recycleBinQuery.isLoading || recycleBinQuery.isFetching ? (
                <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                  <LoaderCircleIcon className="animate-spin text-muted-foreground" />
                </div>
              ) : items.length > 0 ? (
                <>
                  <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
                    <div
                      className={`flex h-full min-h-0 flex-col ${tableMinWidthClass}`}
                    >
                      <table className="shrink-0 w-full table-fixed border-b border-border/70 bg-popover caption-bottom text-sm">
                        <RecycleBinTableColGroup
                          showBucketColumn={showBucketColumn}
                        />
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                aria-label={t("explorer.selection.selectAll")}
                                checked={
                                  allSelected
                                    ? true
                                    : partiallySelected
                                      ? "indeterminate"
                                      : false
                                }
                                onCheckedChange={handleSelectAll}
                              />
                            </TableHead>
                            <TableHead className="w-24">
                              {t("buckets.recycleBin.table.type")}
                            </TableHead>
                            <TableHead className="whitespace-normal">
                              {t("buckets.recycleBin.table.path")}
                            </TableHead>
                            {showBucketColumn ? (
                              <TableHead className="w-32">
                                {t("buckets.recycleBin.table.bucket")}
                              </TableHead>
                            ) : null}
                            <TableHead className="w-28">
                              {t("buckets.recycleBin.table.size")}
                            </TableHead>
                            <TableHead className="w-40">
                              {t("buckets.recycleBin.table.deletedAt")}
                            </TableHead>
                            <TableHead className="w-48 text-left">
                              {t("buckets.recycleBin.table.actions")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                      </table>

                      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
                        <table className="w-full table-fixed caption-bottom text-sm">
                          <RecycleBinTableColGroup
                            showBucketColumn={showBucketColumn}
                          />
                          <TableBody className="min-h-0">
                            {items.map((item) => {
                              const rowPending =
                                restoreMutation.isPending ||
                                deleteMutation.isPending;
                              return (
                                <TableRow key={item.id}>
                                  <TableCell className="align-top">
                                    <Checkbox
                                      aria-label={t(
                                        "explorer.selection.selectRow",
                                        {
                                          name: item.name,
                                        },
                                      )}
                                      checked={selectedIds.has(item.id)}
                                      onCheckedChange={(checked) =>
                                        handleSelectRow(item.id, checked)
                                      }
                                    />
                                  </TableCell>
                                  <TableCell className="align-top">
                                    {item.type === "directory"
                                      ? t("buckets.recycleBin.type.directory")
                                      : t("buckets.recycleBin.type.file")}
                                  </TableCell>
                                  <TableCell className="min-w-0 whitespace-normal align-top">
                                    <div className="flex min-w-0 flex-col gap-1">
                                      <span className="break-all font-medium">
                                        {item.name}
                                      </span>
                                      <span className="break-all text-xs text-muted-foreground">
                                        {item.path}
                                      </span>
                                    </div>
                                  </TableCell>
                                  {showBucketColumn ? (
                                    <TableCell className="break-all align-top">
                                      {item.bucket_name}
                                    </TableCell>
                                  ) : null}
                                  <TableCell className="align-top">
                                    {formatBytes(item.size)}
                                  </TableCell>
                                  <TableCell className="align-top">
                                    {formatDate(item.deleted_at, locale)}
                                  </TableCell>
                                  <TableCell className="whitespace-normal align-top">
                                    <div className="flex flex-wrap justify-start gap-2">
                                      <Button
                                        disabled={rowPending}
                                        onClick={() =>
                                          openRestoreConfirmation([item])
                                        }
                                        size="sm"
                                        type="button"
                                        variant="outline"
                                      >
                                        <ArchiveRestoreIcon />
                                        {t("buckets.recycleBin.restore")}
                                      </Button>
                                      <Button
                                        disabled={rowPending}
                                        onClick={() =>
                                          openDeleteConfirmation([item])
                                        }
                                        size="sm"
                                        type="button"
                                        variant="destructive"
                                      >
                                        <Trash2Icon />
                                        {t("buckets.recycleBin.delete")}
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </table>
                      </ScrollArea>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 p-6">
                  <Empty className="min-h-0 flex-1 border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Trash2Icon />
                      </EmptyMedia>
                      <EmptyTitle>
                        {t("buckets.recycleBin.emptyTitle")}
                      </EmptyTitle>
                      <EmptyDescription>
                        {t("buckets.recycleBin.emptyDescription")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {selectedCount > 0 ? (
                <>
                  <div className="mr-1 text-sm font-medium text-muted-foreground">
                    {t("buckets.recycleBin.selectedCount", {
                      count: selectedCount,
                    })}
                  </div>
                  <Button
                    disabled={actionsPending}
                    onClick={() => openRestoreConfirmation(selectedItems)}
                    type="button"
                    variant="outline"
                  >
                    {restoreMutation.isPending ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <ArchiveRestoreIcon />
                    )}
                    {t("buckets.recycleBin.restoreSelected")}
                  </Button>
                  <Button
                    disabled={actionsPending}
                    onClick={() => openDeleteConfirmation(selectedItems)}
                    type="button"
                    variant="destructive"
                  >
                    {deleteMutation.isPending ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <Trash2Icon />
                    )}
                    {t("buckets.recycleBin.deleteSelected")}
                  </Button>
                  <Button
                    disabled={actionsPending}
                    onClick={() => setSelectedIds(new Set())}
                    type="button"
                    variant="ghost"
                  >
                    {t("buckets.recycleBin.clearSelection")}
                  </Button>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="text-sm text-muted-foreground">
                {t("buckets.recycleBin.pagination", {
                  page: cursorHistory.length + 1,
                })}
              </div>
              <Button
                onClick={() => {
                  void queryClient.invalidateQueries({
                    queryKey: recycleBinBaseQueryKey,
                  });
                }}
                type="button"
                variant="ghost"
              >
                <RefreshCcwIcon />
                {t("buckets.recycleBin.refresh")}
              </Button>
              <Button
                disabled={cursorHistory.length === 0}
                onClick={handlePrevPage}
                type="button"
                variant="outline"
              >
                {t("objects.pagination.previous")}
              </Button>
              <Button
                disabled={!recycleBinQuery.data?.next_cursor}
                onClick={handleNextPage}
                type="button"
                variant="outline"
              >
                {t("objects.pagination.next")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!restoreMutation.isPending) {
            setRestoreDialogOpen(nextOpen);
            if (!nextOpen) {
              setPendingRestoreItems([]);
            }
          }
        }}
        open={restoreDialogOpen}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <ArchiveRestoreIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("buckets.recycleBin.restoreConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("buckets.recycleBin.restoreConfirmDescription", {
                count: pendingRestoreItems.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ScrollArea className="max-h-56 rounded-lg border border-border/70">
            <ul className="divide-y divide-border/60">
              {pendingRestoreItems.map((item) => (
                <li className="px-3 py-2 text-sm" key={item.id}>
                  <div className="font-medium">{item.name}</div>
                  <div className="break-all text-xs text-muted-foreground">
                    {showBucketColumn
                      ? `${item.bucket_name} / ${item.path}`
                      : item.path}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <Button
              disabled={restoreMutation.isPending}
              onClick={() => void handleRestore()}
              type="button"
              variant="default"
            >
              {restoreMutation.isPending ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : null}
              {t("buckets.recycleBin.restore")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!deleteMutation.isPending) {
            setDeleteDialogOpen(nextOpen);
            if (!nextOpen) {
              setPendingDeleteItems([]);
            }
          }
        }}
        open={deleteDialogOpen}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <CircleAlertIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("buckets.recycleBin.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("buckets.recycleBin.deleteConfirmDescription", {
                count: pendingDeleteItems.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ScrollArea className="max-h-56 rounded-lg border border-border/70">
            <ul className="divide-y divide-border/60">
              {pendingDeleteItems.map((item) => (
                <li className="px-3 py-2 text-sm" key={item.id}>
                  <div className="font-medium">{item.name}</div>
                  <div className="break-all text-xs text-muted-foreground">
                    {showBucketColumn
                      ? `${item.bucket_name} / ${item.path}`
                      : item.path}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
              type="button"
              variant="destructive"
            >
              {deleteMutation.isPending ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : null}
              {t("buckets.recycleBin.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RecycleBinTableColGroup({
  showBucketColumn,
}: {
  showBucketColumn: boolean;
}) {
  return (
    <colgroup>
      <col className="w-12" />
      <col className="w-24" />
      <col />
      {showBucketColumn ? <col className="w-32" /> : null}
      <col className="w-28" />
      <col className="w-40" />
      <col className="w-48" />
    </colgroup>
  );
}

async function invalidateAffectedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  settings: { apiBaseUrl: string; bearerToken: string },
  items: RecycleBinObjectItem[],
) {
  const buckets = new Set(items.map((item) => item.bucket_name));

  await Promise.all([
    ...Array.from(buckets).map((bucketName) =>
      queryClient.invalidateQueries({
        queryKey: [
          "explorer-entries",
          settings.apiBaseUrl,
          settings.bearerToken,
          bucketName,
        ],
      }),
    ),
  ]);
}

function removeRecycleBinItemsFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  recycleBinBaseQueryKey: readonly unknown[],
  items: RecycleBinObjectItem[],
) {
  if (items.length === 0) {
    return;
  }

  const itemIDs = new Set(items.map((item) => item.id));

  queryClient.setQueriesData<RecycleBinObjectListResult>(
    { queryKey: recycleBinBaseQueryKey },
    (current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter((item) => !itemIDs.has(item.id)),
      };
    },
  );
}
