import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  FolderSearchIcon,
  RefreshCcwIcon,
  SearchIcon,
  TreePineIcon,
} from "lucide-react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  buildPublicObjectURL,
  createFolder,
  createSignedDownloadURL,
  deleteFolder,
  deleteObject,
  listExplorerEntries,
  listFolderTree,
  uploadObject,
} from "@/api/objects";
import { EmptyState } from "@/components/EmptyState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ToastProvider";
import { CreateFolderDialog } from "@/features/explorer/CreateFolderDialog";
import { ExplorerTable } from "@/features/explorer/ExplorerTable";
import { FolderTree } from "@/features/explorer/FolderTree";
import { UploadObjectDialog, type UploadDialogValue } from "@/features/explorer/UploadObjectDialog";
import {
  buildFolderTree,
  explorerPageSizes,
  getExplorerBreadcrumbs,
  normalizeExplorerPrefix,
  normalizeExplorerSearch,
  parseExplorerLimit,
  joinExplorerPath,
} from "@/lib/explorer";
import { useI18n } from "@/lib/i18n";
import { useAppSettings } from "@/lib/settings";

export function BucketObjectsPage() {
  const { bucket = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useAppSettings();
  const { t } = useI18n();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingPath, setDeletingPath] = useState("");
  const [signingPath, setSigningPath] = useState("");

  const prefix = normalizeExplorerPrefix(searchParams.get("prefix"));
  const search = normalizeExplorerSearch(searchParams.get("search"));
  const cursor = searchParams.get("cursor") ?? "";
  const limit = parseExplorerLimit(searchParams.get("limit"));
  const folderQueryKey = [
    "folders",
    settings.apiBaseUrl,
    settings.bearerToken,
    bucket,
  ] as const;
  const entriesQueryKey = [
    "explorer-entries",
    settings.apiBaseUrl,
    settings.bearerToken,
    bucket,
    prefix,
    search,
    cursor,
    limit,
  ] as const;

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    setCursorHistory([]);
  }, [bucket, prefix, search, limit]);

  const foldersQuery = useQuery({
    queryKey: folderQueryKey,
    queryFn: () => listFolderTree(settings, bucket),
    enabled: bucket !== "",
  });

  const entriesQuery = useQuery({
    queryKey: entriesQueryKey,
    queryFn: () =>
      listExplorerEntries(settings, {
        bucket,
        prefix,
        search,
        limit,
        cursor,
      }),
    enabled: bucket !== "",
  });

  const uploadMutation = useMutation({
    mutationFn: (value: UploadDialogValue) =>
      uploadObject(settings, {
        bucket,
        objectKey: joinExplorerPath(prefix, value.objectKey),
        file: value.file,
        visibility: value.visibility,
        onProgress: setUploadProgress,
      }),
    onSuccess: async () => {
      setUploadProgress(0);
      pushToast("success", t("toast.objectUploaded"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: folderQueryKey }),
        queryClient.invalidateQueries({
          queryKey: [
            "explorer-entries",
            settings.apiBaseUrl,
            settings.bearerToken,
            bucket,
          ],
        }),
      ]);
    },
    onError: (error) => {
      setUploadProgress(0);
      const message = error instanceof Error ? error.message : t("errors.uploadObject");
      pushToast("error", message);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      createFolder(settings, {
        bucket,
        prefix,
        name,
      }),
    onSuccess: async () => {
      pushToast("success", t("toast.folderCreated"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: folderQueryKey }),
        queryClient.invalidateQueries({
          queryKey: [
            "explorer-entries",
            settings.apiBaseUrl,
            settings.bearerToken,
            bucket,
          ],
        }),
      ]);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : t("errors.createFolder");
      pushToast("error", message);
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (objectKey: string) => {
      setDeletingPath(objectKey);
      await deleteObject(settings, bucket, objectKey);
    },
    onSuccess: async () => {
      pushToast("success", t("toast.objectDeleted"));
      await queryClient.invalidateQueries({
        queryKey: [
          "explorer-entries",
          settings.apiBaseUrl,
          settings.bearerToken,
          bucket,
        ],
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : t("errors.deleteObject");
      pushToast("error", message);
    },
    onSettled: () => {
      setDeletingPath("");
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderPath: string) => {
      setDeletingPath(folderPath);
      await deleteFolder(settings, bucket, folderPath);
    },
    onSuccess: async () => {
      pushToast("success", t("toast.folderDeleted"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: folderQueryKey }),
        queryClient.invalidateQueries({
          queryKey: [
            "explorer-entries",
            settings.apiBaseUrl,
            settings.bearerToken,
            bucket,
          ],
        }),
      ]);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : t("errors.deleteFolder");
      pushToast("error", message);
    },
    onSettled: () => {
      setDeletingPath("");
    },
  });

  const signMutation = useMutation({
    mutationFn: async (objectKey: string) => {
      setSigningPath(objectKey);
      return createSignedDownloadURL(settings, bucket, objectKey, 300);
    },
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener");
      pushToast("success", t("toast.signedDownloadReady"));
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : t("errors.signObject");
      pushToast("error", message);
    },
    onSettled: () => {
      setSigningPath("");
    },
  });

  const folderTree = useMemo(
    () => buildFolderTree(foldersQuery.data?.items ?? []),
    [foldersQuery.data?.items],
  );
  const breadcrumbs = getExplorerBreadcrumbs(prefix);
  const entries = entriesQuery.data?.items ?? [];

  if (!bucket) {
    return (
      <EmptyState
        description={t("errors.bucketNotFound")}
        icon={FolderSearchIcon}
        title={t("explorer.title")}
      />
    );
  }

  function updateSearchParams(
    updates: Partial<Record<"prefix" | "search" | "cursor" | "limit", string>>,
  ) {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        next.delete(key);
        continue;
      }
      next.set(key, value);
    }

    setSearchParams(next, { replace: false });
  }

  function handleNavigatePrefix(nextPrefix: string) {
    setCursorHistory([]);
    setSearchInput("");
    updateSearchParams({
      prefix: nextPrefix || "",
      search: "",
      cursor: "",
    });
  }

  async function handleUpload(value: UploadDialogValue) {
    await uploadMutation.mutateAsync(value);
  }

  async function handleCreateFolder(name: string) {
    await createFolderMutation.mutateAsync(name);
  }

  async function handleDeleteFile(objectKey: string) {
    await deleteFileMutation.mutateAsync(objectKey);
  }

  async function handleDeleteFolder(folderPath: string) {
    await deleteFolderMutation.mutateAsync(folderPath);
  }

  async function handleSignDownload(objectKey: string) {
    await signMutation.mutateAsync(objectKey);
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCursorHistory([]);
    updateSearchParams({
      search: searchInput.trim(),
      cursor: "",
    });
  }

  function handleNextPage() {
    if (!entriesQuery.data?.next_cursor) {
      return;
    }

    setCursorHistory((history) => [...history, cursor]);
    updateSearchParams({
      cursor: entriesQuery.data.next_cursor,
    });
  }

  function handlePrevPage() {
    if (cursorHistory.length === 0) {
      return;
    }

    const nextHistory = [...cursorHistory];
    const previousCursor = nextHistory.pop() ?? "";
    setCursorHistory(nextHistory);
    updateSearchParams({
      cursor: previousCursor,
    });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-6">
      <Card className="flex min-h-[720px] flex-1 flex-col overflow-hidden border-border/70 bg-card py-0">
        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Button onClick={() => navigate(-1)} size="icon-sm" type="button" variant="outline">
                <ChevronLeftIcon />
                <span className="sr-only">{t("explorer.actions.goBack")}</span>
              </Button>
              <Button onClick={() => navigate(1)} size="icon-sm" type="button" variant="outline">
                <ChevronRightIcon />
                <span className="sr-only">{t("explorer.actions.goForward")}</span>
              </Button>
            </div>

            <Separator className="hidden h-5 sm:block" orientation="vertical" />

            <div className="min-w-0 flex-1">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <button onClick={() => handleNavigatePrefix("")} type="button">
                        {bucket}
                      </button>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {breadcrumbs.map((item, index) => {
                    const isLast = index === breadcrumbs.length - 1;
                    return (
                      <Fragment key={item.prefix}>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          {isLast ? (
                            <BreadcrumbPage>{item.label}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink asChild>
                              <button
                                onClick={() => handleNavigatePrefix(item.prefix)}
                                type="button"
                              >
                                {item.label}
                              </button>
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                      </Fragment>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
        </div>

        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button type="button" variant="outline">
                      <TreePineIcon data-icon="inline-start" />
                      {t("explorer.toolbar.tree")}
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="p-0" side="left">
                    <SheetHeader className="border-b border-border/70">
                      <SheetTitle>{t("explorer.tree.title")}</SheetTitle>
                      <SheetDescription>
                        {t("explorer.tree.mobileDescription")}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="min-h-0 flex-1">
                      <FolderTree
                        activePrefix={prefix}
                        bucketName={bucket}
                        loading={foldersQuery.isLoading}
                        nodes={folderTree}
                        onNavigate={handleNavigatePrefix}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              <UploadObjectDialog
                currentPrefix={prefix}
                onSubmit={handleUpload}
                pending={uploadMutation.isPending}
                progress={uploadProgress}
              />

              <CreateFolderDialog
                currentPrefix={prefix}
                onSubmit={handleCreateFolder}
                pending={createFolderMutation.isPending}
              />

              <Button
                onClick={() => {
                  void Promise.all([
                    queryClient.invalidateQueries({ queryKey: folderQueryKey }),
                    queryClient.invalidateQueries({ queryKey: entriesQueryKey }),
                  ]);
                }}
                type="button"
                variant="outline"
              >
                <RefreshCcwIcon data-icon="inline-start" />
                {t("explorer.toolbar.refresh")}
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <form className="flex items-center gap-2" onSubmit={handleSearchSubmit}>
                <FieldGroup>
                  <Field orientation="responsive">
                    <FieldLabel className="sr-only" htmlFor="explorer-search">
                      {t("explorer.toolbar.search")}
                    </FieldLabel>
                    <Input
                      id="explorer-search"
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder={t("explorer.toolbar.searchPlaceholder")}
                      value={searchInput}
                    />
                  </Field>
                </FieldGroup>
                <Button size="icon-sm" type="submit" variant="outline">
                  <SearchIcon />
                  <span className="sr-only">{t("common.apply")}</span>
                </Button>
              </form>

              <Select
                onValueChange={(value) =>
                  updateSearchParams({
                    limit: value,
                    cursor: "",
                  })
                }
                value={String(limit)}
              >
                <SelectTrigger aria-label={t("explorer.toolbar.limit")} className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" position="popper">
                  <SelectGroup>
                    {explorerPageSizes.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {t("explorer.limit.option", { count: size })}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[288px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r border-border/70 bg-muted md:flex">
            <FolderTree
              activePrefix={prefix}
              bucketName={bucket}
              loading={foldersQuery.isLoading}
              nodes={folderTree}
              onNavigate={handleNavigatePrefix}
            />
          </aside>

          <div className="min-w-0">
            {foldersQuery.isError ? (
              <div className="border-b border-border/70 p-4">
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>{t("errors.loadFolders")}</AlertTitle>
                  <AlertDescription>{foldersQuery.error.message}</AlertDescription>
                </Alert>
              </div>
            ) : null}

            {entriesQuery.isError ? (
              <div className="border-b border-border/70 p-4">
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>{t("errors.loadEntries")}</AlertTitle>
                  <AlertDescription>{entriesQuery.error.message}</AlertDescription>
                </Alert>
              </div>
            ) : null}

            {entriesQuery.isLoading ? (
              <ExplorerEntriesLoading />
            ) : entries.length > 0 ? (
              <>
                <div className="min-h-0 flex-1 overflow-auto">
                  <ExplorerTable
                    bucket={bucket}
                    buildPublicUrl={(objectKey) =>
                      buildPublicObjectURL(settings.apiBaseUrl, bucket, objectKey)
                    }
                    deletingPath={deletingPath}
                    entries={entries}
                    onDeleteFile={handleDeleteFile}
                    onDeleteFolder={handleDeleteFolder}
                    onOpenDirectory={handleNavigatePrefix}
                    onSignDownload={handleSignDownload}
                    signingPath={signingPath}
                  />
                </div>
                <div className="flex flex-col gap-4 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    {t("explorer.pagination.summary", {
                      count: entries.length,
                      page: cursorHistory.length + 1,
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={cursorHistory.length === 0}
                      onClick={handlePrevPage}
                      type="button"
                      variant="outline"
                    >
                      {t("objects.pagination.previous")}
                    </Button>
                    <Button
                      disabled={!entriesQuery.data?.next_cursor}
                      onClick={handleNextPage}
                      type="button"
                      variant="outline"
                    >
                      {t("objects.pagination.next")}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6">
                <EmptyState
                  description={t("explorer.empty.description")}
                  icon={FolderSearchIcon}
                  title={t("explorer.empty.title")}
                />
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

function ExplorerEntriesLoading() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton className="h-12 w-full" key={index} />
      ))}
    </div>
  );
}
