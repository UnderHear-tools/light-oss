import {
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  GlobeIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { forwardRef, useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ExplorerDirectoryEntry,
  ExplorerEntry,
  ExplorerFileEntry,
  ObjectVisibility,
} from "@/api/types";
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
import { useToast } from "@/components/ToastProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  PublishObjectSiteDialog,
  type PublishObjectSiteValue,
} from "@/features/explorer/PublishObjectSiteDialog";
import { PublishSiteDialog, type PublishSiteValue } from "@/features/explorer/PublishSiteDialog";
import { downloadFile } from "@/lib/utils";

export function ExplorerTable({
  bucket,
  buildPublicUrl,
  deletingPath,
  downloadingFolderPath,
  entries,
  onDeleteFile,
  onDeleteFolder,
  onDownloadFolder,
  onOpenDirectory,
  onPublishObjectSite,
  onPublishSite,
  onSignDownload,
  onUpdateVisibility,
  publishingPath,
  signingPath,
}: {
  bucket: string;
  buildPublicUrl: (objectKey: string) => string;
  deletingPath: string;
  downloadingFolderPath: string;
  entries: ExplorerEntry[];
  onDeleteFile: (objectKey: string) => Promise<void>;
  onDeleteFolder: (folderPath: string) => Promise<void>;
  onDownloadFolder: (folderPath: string) => Promise<void>;
  onOpenDirectory: (folderPath: string) => void;
  onPublishObjectSite: (objectKey: string, value: PublishObjectSiteValue) => Promise<void>;
  onPublishSite: (folderPath: string, value: PublishSiteValue) => Promise<void>;
  onSignDownload: (objectKey: string) => Promise<void>;
  onUpdateVisibility: (objectKey: string, visibility: ObjectVisibility) => Promise<void>;
  publishingPath: string;
  signingPath: string;
}) {
  const { locale, t } = useI18n();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[360px] max-w-[360px] text-base font-semibold text-muted-foreground">
            {t("explorer.table.name")}
          </TableHead>
          <TableHead className="w-[280px] text-base font-semibold text-muted-foreground">
            {t("explorer.table.url")}
          </TableHead>
          <TableHead className="w-[120px] text-base font-semibold text-muted-foreground">
            {t("explorer.table.size")}
          </TableHead>
          <TableHead className="w-[160px] text-base font-semibold text-muted-foreground">
            {t("explorer.table.storageType")}
          </TableHead>
          <TableHead className="w-[220px] text-base font-semibold text-muted-foreground">
            {t("explorer.table.updatedAt")}
          </TableHead>
          <TableHead className="w-[180px] text-base font-semibold text-muted-foreground">
            {t("explorer.table.actions")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.path}>
            <TableCell className="w-[360px] max-w-[360px]">
              <ExplorerEntryName entry={entry} buildPublicUrl={buildPublicUrl} onOpenDirectory={onOpenDirectory} onUpdateVisibility={onUpdateVisibility} />
            </TableCell>
            <TableCell className="max-w-[280px]">
              <ExplorerEntryUrlCell
                buildPublicUrl={buildPublicUrl}
                copyLabel={t("explorer.actions.copyUrl")}
                entry={entry}
              />
            </TableCell>
            <TableCell className={entry.type === "directory" ? "text-muted-foreground" : undefined}>
              {entry.type === "directory" ? "-" : formatBytes(entry.size)}
            </TableCell>
            <TableCell className={entry.type === "directory" ? "text-muted-foreground" : undefined}>
              {entry.type === "directory" ? (
                "-"
              ) : (
                <Badge variant={entry.visibility === "public" ? "default" : "secondary"}>
                  {entry.visibility === "public"
                    ? t("objects.visibility.public")
                    : t("objects.visibility.private")}
                </Badge>
              )}
            </TableCell>
            <TableCell className={entry.type === "directory" ? "text-muted-foreground" : undefined}>
              {entry.type === "directory" ? "-" : formatDate(entry.updated_at, locale)}
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-start gap-1">
                {entry.type === "directory" ? (
                  <>
                    <ExplorerIconButton
                      label={t("explorer.actions.openFolder")}
                      onClick={() => onOpenDirectory(entry.path)}
                    >
                      <FolderOpenIcon className="text-amber-500" />
                    </ExplorerIconButton>

                    <DownloadFolderZipButton
                      downloadingFolderPath={downloadingFolderPath}
                      entry={entry}
                      onDownloadFolder={onDownloadFolder}
                    />

                    <PublishFolderSiteButton
                      bucket={bucket}
                      entry={entry}
                      onPublishSite={onPublishSite}
                      publishingPath={publishingPath}
                    />

                    <DeleteFolderButton
                      bucket={bucket}
                      deletingPath={deletingPath}
                      entry={entry}
                      onDeleteFolder={onDeleteFolder}
                    />
                  </>
                ) : (
                  <>
                    <FileDetailsButton
                      buildPublicUrl={buildPublicUrl}
                      entry={entry}
                      onUpdateVisibility={onUpdateVisibility}
                    >
                      <ExplorerIconButton
                        label={t("explorer.actions.viewDetails")}
                      >
                        <EyeIcon className="text-muted-foreground" />
                      </ExplorerIconButton>
                    </FileDetailsButton>

                    {entry.visibility === "public" ? (
                      <ExplorerIconLink
                        href={buildPublicUrl(entry.object_key)}
                        label={t("explorer.actions.directDownload")}
                      >
                        <DownloadIcon className="text-sky-500" />
                      </ExplorerIconLink>
                    ) : (
                      <ExplorerIconButton
                        disabled={signingPath === entry.path}
                        label={t("explorer.actions.signedDownload")}
                        onClick={() => void onSignDownload(entry.object_key)}
                      >
                        {signingPath === entry.path ? (
                          <LoaderCircleIcon className="animate-spin text-sky-500" />
                        ) : (
                          <DownloadIcon className="text-sky-500" />
                        )}
                      </ExplorerIconButton>
                    )}

                    <PublishObjectSiteButton
                      bucket={bucket}
                      entry={entry}
                      onPublishObjectSite={onPublishObjectSite}
                      publishingPath={publishingPath}
                    />

                    <DeleteFileButton
                      bucket={bucket}
                      deletingPath={deletingPath}
                      entry={entry}
                      onDeleteFile={onDeleteFile}
                    />
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ExplorerEntryName({
  entry,
  buildPublicUrl,
  onOpenDirectory,
  onUpdateVisibility,
}: {
  entry: ExplorerEntry;
  buildPublicUrl: (objectKey: string) => string;
  onOpenDirectory: (folderPath: string) => void;
  onUpdateVisibility: (objectKey: string, visibility: ObjectVisibility) => Promise<void>;
}) {
  if (entry.type === "directory") {
    return (
      <Button
        className="w-full max-w-full min-w-0 cursor-pointer justify-start items-center gap-2 px-0 font-normal hover:bg-transparent"
        onClick={() => onOpenDirectory(entry.path)}
        type="button"
        variant="ghost"
      >
        <span className="inline-flex size-4 items-center justify-center text-amber-500 [&_svg]:size-4">
          <FolderIcon data-icon="inline-start" />
        </span>
        <span className="min-w-0 truncate">{entry.name}</span>
      </Button>
    );
  }

  if (entry.type === "file") {
    return (
      <FileDetailsButton
        buildPublicUrl={buildPublicUrl}
        entry={entry}
        onUpdateVisibility={onUpdateVisibility}
      >
        <Button
          className="flex w-full min-w-0 cursor-pointer justify-start items-center gap-2 px-0 font-normal hover:bg-transparent"
          type="button"
          variant="ghost"
        >
          <span className="inline-flex size-4 items-center justify-center [&_svg]:size-4">
            <FileTextIcon data-icon="inline-start" />
          </span>
          <span className="min-w-0 truncate">{entry.name}</span>
        </Button>
      </FileDetailsButton>
    );
  }

  const exhaustiveEntry: never = entry;
  return exhaustiveEntry;
}

function ExplorerEntryUrlCell({
  buildPublicUrl,
  copyLabel,
  entry,
}: {
  buildPublicUrl: (objectKey: string) => string;
  copyLabel: string;
  entry: ExplorerEntry;
}) {
  const { t } = useI18n();
  const { pushToast } = useToast();

  if (entry.type !== "file" || entry.visibility !== "public") {
    return <span className="text-muted-foreground">-</span>;
  }

  const url = buildPublicUrl(entry.object_key);

  async function handleCopyUrl() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard_unavailable");
      }

      await navigator.clipboard.writeText(url);
      pushToast("success", t("toast.urlCopied"));
    } catch {
      pushToast("error", t("errors.copyUrl"));
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <a
        className="block min-w-0 flex-1 truncate text-sky-600 hover:underline"
        href={url}
        rel="noreferrer"
        target="_blank"
        title={url}
      >
        {url}
      </a>
      <ExplorerIconButton
        label={copyLabel}
        onClick={() => {
          void handleCopyUrl();
        }}
      >
        <CopyIcon className="text-sky-500" />
      </ExplorerIconButton>
    </div>
  );
}

function FileDetailsButton({
  children,
  buildPublicUrl,
  entry,
  onUpdateVisibility,
}: {
  children: React.ReactNode,
  buildPublicUrl: (objectKey: string) => string;
  entry: ExplorerFileEntry;
  onUpdateVisibility: (objectKey: string, visibility: ObjectVisibility) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedVisibility, setSelectedVisibility] = useState<ObjectVisibility>(entry.visibility);
  const [currentVisibility, setCurrentVisibility] = useState<ObjectVisibility>(entry.visibility);
  const [isSavingVisibility, setIsSavingVisibility] = useState(false);
  const { locale, t } = useI18n();
  const { pushToast } = useToast();
  const publicUrl =
    currentVisibility === "public" ? buildPublicUrl(entry.object_key) : "";
  const previewType = getPreviewType(entry);

  useEffect(() => {
    setSelectedVisibility(entry.visibility);
    setCurrentVisibility(entry.visibility);
  }, [entry.visibility, entry.object_key]);

  async function handleSaveVisibility() {
    if (selectedVisibility === currentVisibility || isSavingVisibility) {
      return;
    }

    setIsSavingVisibility(true);
    try {
      await onUpdateVisibility(entry.object_key, selectedVisibility);
      setCurrentVisibility(selectedVisibility);
      pushToast("success", t("toast.objectVisibilityUpdated"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.updateObjectVisibility");
      pushToast("error", message);
    } finally {
      setIsSavingVisibility(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent
        aria-describedby={undefined}
        className="max-h-[85vh] sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{t("explorer.details.title")}</DialogTitle>
        </DialogHeader>

        <div className="-mr-1 overflow-y-auto pr-1">
          <dl className="grid gap-3">
            <DetailField label={t("explorer.details.preview")}>
              <FilePreview
                previewType={previewType}
                publicUrl={publicUrl}
              />
            </DetailField>
            <DetailField label={t("explorer.table.url")} monospace>
              {publicUrl ? (
                <a
                  className="text-sky-600 hover:underline"
                  href={publicUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {publicUrl}
                </a>
              ) : (
                t("common.notAvailable")
              )}
            </DetailField>
            <DetailField label={t("explorer.details.originalFilename")} monospace>
              {entry.original_filename}
            </DetailField>
            <DetailField label={t("explorer.details.contentType")} monospace>
              {entry.content_type}
            </DetailField>
            <DetailField label={t("objects.table.size")}>
              {formatBytes(entry.size)}
            </DetailField>
            <DetailField label={t("objects.table.visibility")}>
              <div className="flex flex-col gap-2">
                <Badge variant={currentVisibility === "public" ? "secondary" : "outline"}>
                  {currentVisibility === "public"
                    ? t("objects.visibility.public")
                    : t("objects.visibility.private")}
                </Badge>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    onValueChange={(value) => setSelectedVisibility(value as ObjectVisibility)}
                    value={selectedVisibility}
                  >
                    <SelectTrigger
                      aria-label={t("objects.form.visibility.label")}
                      className="w-full sm:w-[160px]"
                      disabled={isSavingVisibility}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" side="bottom">
                      <SelectGroup>
                        <SelectItem value="private">{t("objects.visibility.private")}</SelectItem>
                        <SelectItem value="public">{t("objects.visibility.public")}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={isSavingVisibility || selectedVisibility === currentVisibility}
                    onClick={() => {
                      void handleSaveVisibility();
                    }}
                    type="button"
                    variant="outline"
                  >
                    {isSavingVisibility ? (
                      <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                    ) : null}
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            </DetailField>
            <DetailField label={t("explorer.table.updatedAt")}>
              {formatDate(entry.updated_at, locale)}
            </DetailField>
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  children,
  label,
  monospace,
}: {
  children: React.ReactNode;
  label: string;
  monospace?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={monospace ? "mt-1 break-all font-mono text-sm" : "mt-1 text-sm"}>
        {children}
      </dd>
    </div>
  );
}

type PreviewType = "image" | "video" | "audio" | "pdf" | "markdown" | "text" | null;

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="mt-0 text-xl font-semibold text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-6 text-lg font-semibold text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 text-base font-semibold text-foreground">{children}</h3>,
  p: ({ children }) => <p className="leading-7 text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-2 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-2 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border/70 pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border/70" />,
  a: ({ children, ...props }) => (
    <a
      {...props}
      className="font-medium text-sky-600 underline underline-offset-4 hover:text-sky-500"
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border/70 bg-muted/40 px-3 py-2 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border/70 px-3 py-2 align-top">{children}</td>,
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/60 p-3">{children}</pre>
  ),
  code: ({ children, className }) => {
    const content = String(children).replace(/\n$/, "");
    const isInline = !className && !content.includes("\n");

    if (isInline) {
      return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{content}</code>;
    }

    return <code className={`font-mono text-sm ${className ?? ""}`.trim()}>{content}</code>;
  },
};

function FilePreview({
  previewType,
  publicUrl,
}: {
  previewType: PreviewType;
  publicUrl: string;
}) {
  const { t } = useI18n();

  if (!publicUrl || !previewType) {
    return <span className="text-muted-foreground">{t("common.notAvailable")}</span>;
  }

  if (previewType === "image") {
    return (
      <img
        alt="file preview"
        className="max-h-80 w-full rounded-md border border-border/70 object-contain"
        src={publicUrl}
      />
    );
  }

  if (previewType === "video") {
    return (
      <video className="max-h-80 w-full rounded-md border border-border/70" controls src={publicUrl} />
    );
  }

  if (previewType === "audio") {
    return <audio className="w-full" controls src={publicUrl} />;
  }

  if (previewType === "markdown") {
    return <RemoteTextPreview mode="markdown" publicUrl={publicUrl} />;
  }

  if (previewType === "text") {
    return <RemoteTextPreview mode="text" publicUrl={publicUrl} />;
  }

  return (
    <iframe
      className="h-80 w-full rounded-md border border-border/70 bg-background"
      src={publicUrl}
      title="file preview"
    />
  );
}

function RemoteTextPreview({
  mode,
  publicUrl,
}: {
  mode: "markdown" | "text";
  publicUrl: string;
}) {
  const { t } = useI18n();
  const [previewText, setPreviewText] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();

    setPreviewText("");
    setStatus("loading");

    void fetch(publicUrl, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`preview_request_failed_${response.status}`);
        }

        return response.text();
      })
      .then((text) => {
        setPreviewText(text);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string } | null)?.name === "AbortError") {
          return;
        }

        setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [publicUrl]);

  if (status === "loading") {
    return <span className="text-muted-foreground">{t("common.loading")}</span>;
  }

  if (status === "error") {
    return <span className="text-muted-foreground">{t("common.notAvailable")}</span>;
  }

  if (mode === "markdown") {
    return (
      <div className="max-h-80 overflow-auto rounded-md border border-border/70 bg-background p-4">
        <div className="space-y-4 text-sm">
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[remarkGfm]}
            skipHtml
          >
            {previewText}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <pre className="max-h-80 overflow-auto rounded-md border border-border/70 bg-background p-3 font-mono text-sm whitespace-pre-wrap break-words">
      {previewText}
    </pre>
  );
}

function getPreviewType(entry: ExplorerFileEntry): PreviewType {
  const contentType = entry.content_type.toLowerCase();
  const name = entry.original_filename.toLowerCase();

  if (contentType.startsWith("image/")) {
    return "image";
  }
  if (contentType.startsWith("video/")) {
    return "video";
  }
  if (contentType.startsWith("audio/")) {
    return "audio";
  }
  if (contentType === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    contentType.includes("markdown") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown")
  ) {
    return "markdown";
  }
  if (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("sql") ||
    name.endsWith(".log")
  ) {
    return "text";
  }

  return null;
}

function DeleteFolderButton({
  bucket,
  deletingPath,
  entry,
  onDeleteFolder,
}: {
  bucket: string;
  deletingPath: string;
  entry: ExplorerDirectoryEntry;
  onDeleteFolder: (folderPath: string) => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <span className="inline-flex">
          <ExplorerIconButton
            disabled={deletingPath === entry.path}
            label={t("explorer.actions.deleteFolder")}
            onClick={() => undefined}
          >
            {deletingPath === entry.path ? (
              <LoaderCircleIcon className="animate-spin text-destructive" />
            ) : (
              <Trash2Icon className="text-destructive" />
            )}
          </ExplorerIconButton>
        </span>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ShieldAlertIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{t("explorer.deleteFolder.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("explorer.deleteFolder.description", {
              bucket,
              name: entry.name,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void onDeleteFolder(entry.path)}
            variant="destructive"
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DownloadFolderZipButton({
  downloadingFolderPath,
  entry,
  onDownloadFolder,
}: {
  downloadingFolderPath: string;
  entry: ExplorerDirectoryEntry;
  onDownloadFolder: (folderPath: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const pending = downloadingFolderPath === entry.path;

  return (
    <ExplorerIconButton
      disabled={pending}
      label={
        pending
          ? t("explorer.actions.downloadingFolderZip")
          : t("explorer.actions.downloadFolderZip")
      }
      onClick={() => {
        void onDownloadFolder(entry.path).catch(() => undefined);
      }}
    >
      {pending ? (
        <LoaderCircleIcon className="animate-spin text-sky-500" />
      ) : (
        <DownloadIcon className="text-sky-500" />
      )}
    </ExplorerIconButton>
  );
}

function PublishFolderSiteButton({
  bucket,
  entry,
  onPublishSite,
  publishingPath,
}: {
  bucket: string;
  entry: ExplorerDirectoryEntry;
  onPublishSite: (folderPath: string, value: PublishSiteValue) => Promise<void>;
  publishingPath: string;
}) {
  const { t } = useI18n();
  const pending = publishingPath === entry.path;

  return (
    <PublishSiteDialog
      bucket={bucket}
      onSubmit={(value) => onPublishSite(entry.path, value)}
      pending={pending}
      prefix={entry.path}
      trigger={
        <span className="inline-flex">
          <ExplorerIconButton
            disabled={pending}
            label={t("explorer.actions.publishSite")}
            onClick={() => undefined}
          >
            {pending ? (
              <LoaderCircleIcon className="animate-spin text-emerald-500" />
            ) : (
              <GlobeIcon className="text-emerald-500" />
            )}
          </ExplorerIconButton>
        </span>
      }
    />
  );
}

function PublishObjectSiteButton({
  bucket,
  entry,
  onPublishObjectSite,
  publishingPath,
}: {
  bucket: string;
  entry: ExplorerFileEntry;
  onPublishObjectSite: (objectKey: string, value: PublishObjectSiteValue) => Promise<void>;
  publishingPath: string;
}) {
  const { t } = useI18n();
  const pending = publishingPath === entry.path;

  return (
    <PublishObjectSiteDialog
      bucket={bucket}
      objectKey={entry.object_key}
      onSubmit={(value) => onPublishObjectSite(entry.object_key, value)}
      pending={pending}
      trigger={
        <span className="inline-flex">
          <ExplorerIconButton
            disabled={pending}
            label={t("explorer.actions.publishSite")}
            onClick={() => undefined}
          >
            {pending ? (
              <LoaderCircleIcon className="animate-spin text-emerald-500" />
            ) : (
              <GlobeIcon className="text-emerald-500" />
            )}
          </ExplorerIconButton>
        </span>
      }
    />
  );
}

function DeleteFileButton({
  bucket,
  deletingPath,
  entry,
  onDeleteFile,
}: {
  bucket: string;
  deletingPath: string;
  entry: ExplorerFileEntry;
  onDeleteFile: (objectKey: string) => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <span className="inline-flex">
          <ExplorerIconButton
            disabled={deletingPath === entry.object_key}
            label={t("common.delete")}
            onClick={() => undefined}
          >
            {deletingPath === entry.object_key ? (
              <LoaderCircleIcon className="animate-spin text-destructive" />
            ) : (
              <Trash2Icon className="text-destructive" />
            )}
          </ExplorerIconButton>
        </span>
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
              objectKey: entry.object_key,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void onDeleteFile(entry.object_key)}
            variant="destructive"
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const ExplorerIconButton = forwardRef<HTMLButtonElement, {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}>(
  function ExplorerIconButton({
    children,
    disabled,
    label,
    onClick,
  }, ref) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              ref={ref}
              className="[&_svg]:size-4"
              disabled={disabled}
              onClick={onClick}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              {children}
              <span className="sr-only">{label}</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="whitespace-nowrap leading-none" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }
);

function ExplorerIconLink({
  children,
  href,
  label,
}: {
  children: React.ReactNode;
  href: string;
  label: string;
}) {
  // 从 href 中提取文件名（最后一个 '/' 之后的部分，并解码）
  const getFileName = (url: string) => {
    const decodedUrl = decodeURIComponent(url);
    const parts = decodedUrl.split('/');
    // 数组的 pop方法移除数组的 最后一个元素并返回
    const lastPart = parts.pop() || 'download';
    return lastPart;
  }

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const filename = getFileName(href);
    downloadFile(href, filename);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button asChild className="[&_svg]:size-4" size="icon-sm" variant="ghost">
            <a href={href} rel="noreferrer" target="_blank" onClick={handleClick}>
              {children}
              <span className="sr-only">{label}</span>
            </a>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="whitespace-nowrap leading-none" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
