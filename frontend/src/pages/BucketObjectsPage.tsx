import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  FolderSearchIcon,
  LoaderCircleIcon,
  RefreshCcwIcon,
  SearchIcon,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  buildPublicObjectURL,
  createFolder,
  createSignedDownloadURL,
  deleteFolder,
  deleteObject,
  downloadFolderZip,
  listExplorerEntries,
  uploadFolder,
  updateObjectVisibility,
  uploadObject,
} from "@/api/objects";
import {
  createSite,
  publishObjectSite,
  uploadAndPublishSite,
} from "@/api/sites";
import { EmptyState } from "@/components/EmptyState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useToast } from "@/components/ToastProvider";
import { CreateFolderDialog } from "@/features/explorer/CreateFolderDialog";
import { ExplorerTable } from "@/features/explorer/ExplorerTable";
import { type PublishSiteValue } from "@/features/explorer/PublishSiteDialog";
import {
  UploadFolderDialog,
  type UploadFolderDialogValue,
} from "@/features/explorer/UploadFolderDialog";
import {
  PublishObjectSiteValue,
} from "@/features/explorer/PublishObjectSiteDialog";
import {
  UploadAndPublishSiteDialog,
  type UploadAndPublishSiteValue,
} from "@/features/sites/UploadAndPublishSiteDialog";
import {
  UploadObjectDialog,
  type UploadDialogValue,
} from "@/features/explorer/UploadObjectDialog";
import {
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
  const [downloadingFolderPath, setDownloadingFolderPath] = useState("");
  const [publishingPath, setPublishingPath] = useState("");
  const [signingPath, setSigningPath] = useState("");

  const prefix = normalizeExplorerPrefix(searchParams.get("prefix"));
  const search = normalizeExplorerSearch(searchParams.get("search"));
  const cursor = searchParams.get("cursor") ?? "";
  const limit = parseExplorerLimit(searchParams.get("limit"));
  const entriesBaseQueryKey = [
    "explorer-entries",
    settings.apiBaseUrl,
    settings.bearerToken,
    bucket,
  ] as const;
  const sitesQueryKey = [
    "sites",
    settings.apiBaseUrl,
    settings.bearerToken,
  ] as const;
  const entriesQueryKey = [
    ...entriesBaseQueryKey,
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
      await queryClient.invalidateQueries({ queryKey: entriesBaseQueryKey });
    },
    onError: (error) => {
      setUploadProgress(0);
      const message =
        error instanceof Error ? error.message : t("errors.uploadObject");
      pushToast("error", message);
    },
  });

  const uploadFolderMutation = useMutation({
    mutationFn: (value: UploadFolderDialogValue) =>
      uploadFolder(settings, {
        bucket,
        prefix,
        files: value.files,
        visibility: value.visibility,
        onProgress: setUploadProgress,
      }),
    onSuccess: async () => {
      setUploadProgress(0);
      pushToast("success", t("toast.folderUploaded"));
      await queryClient.invalidateQueries({ queryKey: entriesBaseQueryKey });
    },
    onError: (error) => {
      setUploadProgress(0);
      const message =
        error instanceof Error ? error.message : t("errors.uploadFolder");
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
      await queryClient.invalidateQueries({ queryKey: entriesBaseQueryKey });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.createFolder");
      pushToast("error", message);
    },
  });

  const uploadAndPublishSiteMutation = useMutation({
    mutationFn: (value: UploadAndPublishSiteValue) =>
      uploadAndPublishSite(settings, {
        bucket: value.bucket,
        parentPrefix: value.parentPrefix,
        files: value.files,
        domains: value.domains,
        enabled: value.enabled,
        indexDocument: value.indexDocument,
        errorDocument: value.errorDocument,
        spaFallback: value.spaFallback,
        onProgress: setUploadProgress,
      }),
    onSuccess: async () => {
      setUploadProgress(0);
      pushToast("success", t("toast.sitePublished"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entriesBaseQueryKey }),
        queryClient.invalidateQueries({ queryKey: sitesQueryKey }),
      ]);
    },
    onError: (error) => {
      setUploadProgress(0);
      const message =
        error instanceof Error ? error.message : t("errors.publishSite");
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
        queryKey: entriesBaseQueryKey,
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.deleteObject");
      pushToast("error", message);
    },
    onSettled: () => {
      setDeletingPath("");
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderPath: string) => {
      setDeletingPath(folderPath);
      await deleteFolder(settings, bucket, folderPath, { recursive: true });
    },
    onSuccess: async () => {
      pushToast("success", t("toast.folderDeleted"));
      await queryClient.invalidateQueries({ queryKey: entriesBaseQueryKey });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.deleteFolder");
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
      const message =
        error instanceof Error ? error.message : t("errors.signObject");
      pushToast("error", message);
    },
    onSettled: () => {
      setSigningPath("");
    },
  });

  const downloadFolderMutation = useMutation({
    mutationFn: async (folderPath: string) => {
      setDownloadingFolderPath(folderPath);
      await downloadFolderZip(settings, bucket, folderPath);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.downloadFolderZip");
      pushToast("error", message);
    },
    onSettled: () => {
      setDownloadingFolderPath("");
    },
  });

  const updateVisibilityMutation = useMutation({
    mutationFn: (input: {
      objectKey: string;
      visibility: "public" | "private";
    }) =>
      updateObjectVisibility(settings, {
        bucket,
        objectKey: input.objectKey,
        visibility: input.visibility,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entriesBaseQueryKey });
    },
  });

  const publishSiteMutation = useMutation({
    mutationFn: async (input: {
      folderPath: string;
      value: PublishSiteValue;
    }) => {
      setPublishingPath(input.folderPath);
      return createSite(settings, {
        bucket,
        root_prefix: input.folderPath,
        enabled: input.value.enabled,
        index_document: input.value.indexDocument,
        error_document: input.value.errorDocument,
        spa_fallback: input.value.spaFallback,
        domains: input.value.domains,
      });
    },
    onSuccess: () => {
      pushToast("success", t("toast.sitePublished"));
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.publishSite");
      pushToast("error", message);
    },
    onSettled: () => {
      setPublishingPath("");
    },
  });

  const publishObjectSiteMutation = useMutation({
    mutationFn: async (input: {
      objectKey: string;
      value: PublishObjectSiteValue;
    }) => {
      setPublishingPath(input.objectKey);
      return publishObjectSite(settings, {
        bucket,
        objectKey: input.objectKey,
        domains: input.value.domains,
        enabled: input.value.enabled,
        errorDocument: input.value.errorDocument,
        spaFallback: input.value.spaFallback,
      });
    },
    onSuccess: async () => {
      pushToast("success", t("toast.sitePublished"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entriesBaseQueryKey }),
        queryClient.invalidateQueries({ queryKey: sitesQueryKey }),
      ]);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("errors.publishSite");
      pushToast("error", message);
    },
    onSettled: () => {
      setPublishingPath("");
    },
  });

  const breadcrumbs = getExplorerBreadcrumbs(prefix);
  const entries = entriesQuery.data?.items ?? [];
  const uploadPending =
    uploadMutation.isPending ||
    uploadFolderMutation.isPending ||
    uploadAndPublishSiteMutation.isPending;

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

  async function handleUploadFolder(value: UploadFolderDialogValue) {
    await uploadFolderMutation.mutateAsync(value);
  }

  async function handleCreateFolder(name: string) {
    await createFolderMutation.mutateAsync(name);
  }

  async function handleUploadAndPublishSite(value: UploadAndPublishSiteValue) {
    await uploadAndPublishSiteMutation.mutateAsync(value);
  }

  async function handleDeleteFile(objectKey: string) {
    await deleteFileMutation.mutateAsync(objectKey);
  }

  async function handleDeleteFolder(folderPath: string) {
    await deleteFolderMutation.mutateAsync(folderPath);
  }

  async function handleDownloadFolder(folderPath: string) {
    await downloadFolderMutation.mutateAsync(folderPath);
  }

  async function handlePublishSite(
    folderPath: string,
    value: PublishSiteValue,
  ) {
    await publishSiteMutation.mutateAsync({ folderPath, value });
  }

  async function handlePublishObjectSite(
    objectKey: string,
    value: PublishObjectSiteValue,
  ) {
    await publishObjectSiteMutation.mutateAsync({ objectKey, value });
  }

  async function handleSignDownload(objectKey: string) {
    await signMutation.mutateAsync(objectKey);
  }

  async function handleUpdateVisibility(
    objectKey: string,
    visibility: "public" | "private",
  ) {
    await updateVisibilityMutation.mutateAsync({ objectKey, visibility });
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
      <Card className="flex min-h-[720px] flex-1 flex-col overflow-hidden border-border/70 bg-card py-0 gap-0">
        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Button
                onClick={() => navigate(-1)}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronLeftIcon />
                <span className="sr-only">{t("explorer.actions.goBack")}</span>
              </Button>
              <Button
                onClick={() => navigate(1)}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronRightIcon />
                <span className="sr-only">
                  {t("explorer.actions.goForward")}
                </span>
              </Button>
            </div>

            <Separator className="hidden h-5 sm:block" orientation="vertical" />

            <div className="min-w-0 flex-1">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <button
                        onClick={() => handleNavigatePrefix("")}
                        type="button"
                      >
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
                                onClick={() =>
                                  handleNavigatePrefix(item.prefix)
                                }
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

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col min-w-0">
            <div className="border-b border-border/70 px-4 py-3">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="flex flex-wrap items-center gap-2">
                  <UploadObjectDialog
                    currentPrefix={prefix}
                    onSubmit={handleUpload}
                    pending={uploadPending}
                    progress={uploadProgress}
                  />

                  <UploadFolderDialog
                    currentPrefix={prefix}
                    onSubmit={handleUploadFolder}
                    pending={uploadPending}
                    progress={uploadProgress}
                  />

                  <UploadAndPublishSiteDialog
                    bucket={bucket}
                    lockedFields={{ bucket: true, parentPrefix: true }}
                    onSubmit={handleUploadAndPublishSite}
                    parentPrefix={prefix}
                    pending={uploadAndPublishSiteMutation.isPending}
                    progress={uploadProgress}
                  />

                  <CreateFolderDialog
                    currentPrefix={prefix}
                    onSubmit={handleCreateFolder}
                    pending={createFolderMutation.isPending}
                  />

                  <Button
                    onClick={() => {
                      void queryClient.invalidateQueries({
                        queryKey: entriesBaseQueryKey,
                      });
                    }}
                    type="button"
                    variant="outline"
                  >
                    <RefreshCcwIcon data-icon="inline-start" />
                    {t("explorer.toolbar.refresh")}
                  </Button>
                </div>

                <div className="flex w-full min-w-0 flex-col gap-3 lg:ml-auto lg:max-w-md">
                  <form
                    className="flex w-full min-w-0 items-center gap-2"
                    onSubmit={handleSearchSubmit}
                  >
                    <FieldGroup className="min-w-0 flex-1">
                      <Field className="min-w-0" orientation="responsive">
                        <FieldLabel
                          className="sr-only"
                          htmlFor="explorer-search"
                        >
                          {t("explorer.toolbar.search")}
                        </FieldLabel>
                        <Input
                          className="min-w-0"
                          id="explorer-search"
                          onChange={(event) =>
                            setSearchInput(event.target.value)
                          }
                          placeholder={t("explorer.toolbar.searchPlaceholder")}
                          value={searchInput}
                        />
                      </Field>
                    </FieldGroup>
                    <Button
                      className="shrink-0"
                      size="icon-sm"
                      type="submit"
                      variant="outline"
                    >
                      <SearchIcon />
                      <span className="sr-only">{t("common.apply")}</span>
                    </Button>
                  </form>
                </div>
              </div>
            </div>

            {entriesQuery.isError ? (
              <div className="border-b border-border/70 p-4">
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>{t("errors.loadEntries")}</AlertTitle>
                  <AlertDescription>
                    {entriesQuery.error.message}
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}

            {entriesQuery.isLoading || entriesQuery.isFetching ? (
              <div className="flex min-h-[320px] items-center justify-center p-4">
                <LoaderCircleIcon className="animate-spin text-muted-foreground" />
              </div>
            ) : entries.length > 0 ? (
              <>
                <div className="min-h-0 flex-1 overflow-auto">
                  <ExplorerTable
                    bucket={bucket}
                    buildPublicUrl={(objectKey) =>
                      buildPublicObjectURL(
                        settings.apiBaseUrl,
                        bucket,
                        objectKey,
                      )
                    }
                    deletingPath={deletingPath}
                    downloadingFolderPath={downloadingFolderPath}
                    entries={entries}
                    onDeleteFile={handleDeleteFile}
                    onDeleteFolder={handleDeleteFolder}
                    onDownloadFolder={handleDownloadFolder}
                    onOpenDirectory={handleNavigatePrefix}
                    onPublishObjectSite={handlePublishObjectSite}
                    onPublishSite={handlePublishSite}
                    onSignDownload={handleSignDownload}
                    onUpdateVisibility={handleUpdateVisibility}
                    publishingPath={publishingPath}
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select
                      onValueChange={(value) =>
                        updateSearchParams({
                          limit: value,
                          cursor: "",
                        })
                      }
                      value={String(limit)}
                    >
                      <SelectTrigger
                        aria-label={t("explorer.toolbar.limit")}
                        className="w-full sm:w-[140px]"
                      >
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
