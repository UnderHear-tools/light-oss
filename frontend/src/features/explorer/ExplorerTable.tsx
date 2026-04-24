import {
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileDirectoryFillIcon,
  FileDirectoryOpenFillIcon,
  FileIcon,
  GlobeIcon,
  KebabHorizontalIcon,
  LockIcon,
  ScreenFullIcon,
  ShieldIcon,
  FilterIcon,
  SortAscIcon,
  SortDescIcon,
  SyncIcon,
  TrashIcon,
  UnlockIcon,
} from "@primer/octicons-react";
import { forwardRef, useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBytes, formatDate } from "@/lib/format";
import type { ExplorerSortBy, ExplorerSortOrder } from "@/lib/explorer";
import { useI18n } from "@/lib/i18n";
import {
  PublishObjectSiteDialog,
  type PublishObjectSiteValue,
} from "@/features/explorer/PublishObjectSiteDialog";
import {
  PublishSiteDialog,
  type PublishSiteValue,
} from "@/features/explorer/PublishSiteDialog";
import { cn } from "@/lib/utils";

const explorerTableMinWidthClass = "min-w-[85.5rem]";
const explorerSelectionColumnWidthClass = "w-6";
const explorerStickyHeaderCellClass =
  "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--color-border)]";

export function ExplorerTable({
  bucket,
  buildPublicUrl,
  deletingPath,
  downloadingFilePath,
  downloadingFolderPath,
  entries,
  onDeleteFile,
  onDeleteFolder,
  onDownloadFile,
  onDownloadFolder,
  onOpenDirectory,
  onPublishObjectSite,
  onPublishSite,
  onSelectAll,
  onSelectEntry,
  onSortApply,
  onSortClear,
  onUpdateVisibility,
  publishingPath,
  selectedPaths,
  selectionDisabled = false,
  sortBy,
  sortOrder,
}: {
  bucket: string;
  buildPublicUrl: (objectKey: string) => string;
  deletingPath: string;
  downloadingFilePath: string;
  downloadingFolderPath: string;
  entries: ExplorerEntry[];
  onDeleteFile: (objectKey: string) => Promise<void>;
  onDeleteFolder: (folderPath: string) => Promise<void>;
  onDownloadFile: (entry: ExplorerFileEntry) => Promise<void>;
  onDownloadFolder: (folderPath: string) => Promise<void>;
  onOpenDirectory: (folderPath: string) => void;
  onPublishObjectSite: (
    objectKey: string,
    value: PublishObjectSiteValue,
  ) => Promise<void>;
  onPublishSite: (folderPath: string, value: PublishSiteValue) => Promise<void>;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectEntry: (
    entryPath: string,
    checked: boolean | "indeterminate",
  ) => void;
  onSortApply: (sortBy: ExplorerSortBy, sortOrder: ExplorerSortOrder) => void;
  onSortClear: () => void;
  onUpdateVisibility: (
    objectKey: string,
    visibility: ObjectVisibility,
  ) => Promise<void>;
  publishingPath: string;
  selectedPaths: Set<string>;
  selectionDisabled?: boolean;
  sortBy: ExplorerSortBy | null;
  sortOrder: ExplorerSortOrder | null;
}) {
  const { locale, t } = useI18n();
  const [openSortBy, setOpenSortBy] = useState<ExplorerSortBy | null>(null);
  const selectedCount = entries.filter((entry) =>
    selectedPaths.has(entry.path),
  ).length;
  const allSelected = entries.length > 0 && selectedCount === entries.length;
  const partiallySelected = selectedCount > 0 && !allSelected;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className={cn("h-full min-h-0", explorerTableMinWidthClass)}>
          <ScrollArea className="h-full min-h-0">
            <table className="w-full table-fixed border-b border-border/70 bg-card caption-bottom text-sm">
              <ExplorerTableColGroup />
              <TableHeader className="[&_tr]:border-b-0">
                <TableRow>
                  <TableHead
                    className={cn(
                      explorerStickyHeaderCellClass,
                      explorerSelectionColumnWidthClass,
                    )}
                  >
                    <Checkbox
                      aria-label={t("explorer.selection.selectAll")}
                      disabled={selectionDisabled}
                      checked={
                        allSelected
                          ? true
                          : partiallySelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={onSelectAll}
                    />
                  </TableHead>
                  <TableHead
                    className={cn(
                      explorerStickyHeaderCellClass,
                      "w-[22.5rem] max-w-[22.5rem] text-base font-semibold text-muted-foreground",
                    )}
                  >
                    <ExplorerSortHeader
                      activeSortBy={sortBy}
                      label={t("explorer.table.name")}
                      onApply={onSortApply}
                      onClear={onSortClear}
                      open={openSortBy === "name"}
                      onOpenChange={(open) =>
                        setOpenSortBy(open ? "name" : null)
                      }
                      sortBy="name"
                      sortOrder={sortOrder}
                    />
                  </TableHead>
                  <TableHead
                    className={cn(
                      explorerStickyHeaderCellClass,
                      "w-[17.5rem] text-base font-semibold text-muted-foreground",
                    )}
                  >
                    {t("explorer.table.url")}
                  </TableHead>
                  <TableHead
                    className={cn(
                      explorerStickyHeaderCellClass,
                      "w-[7.5rem] text-base font-semibold text-muted-foreground",
                    )}
                  >
                    <ExplorerSortHeader
                      activeSortBy={sortBy}
                      label={t("explorer.table.size")}
                      onApply={onSortApply}
                      onClear={onSortClear}
                      open={openSortBy === "size"}
                      onOpenChange={(open) =>
                        setOpenSortBy(open ? "size" : null)
                      }
                      sortBy="size"
                      sortOrder={sortOrder}
                    />
                  </TableHead>
                  <TableHead
                    className={cn(
                      explorerStickyHeaderCellClass,
                      "w-[10rem] text-base font-semibold text-muted-foreground",
                    )}
                  >
                    {t("objects.form.visibility.label")}
                  </TableHead>
                  <TableHead
                    className={cn(
                      explorerStickyHeaderCellClass,
                      "w-[13.75rem] text-base font-semibold text-muted-foreground",
                    )}
                  >
                    <ExplorerSortHeader
                      activeSortBy={sortBy}
                      label={t("objects.table.createdAt")}
                      onApply={onSortApply}
                      onClear={onSortClear}
                      open={openSortBy === "created_at"}
                      onOpenChange={(open) =>
                        setOpenSortBy(open ? "created_at" : null)
                      }
                      sortBy="created_at"
                      sortOrder={sortOrder}
                    />
                  </TableHead>
                  <TableHead
                    className={cn(
                      explorerStickyHeaderCellClass,
                      "w-[11.25rem] text-base font-semibold text-muted-foreground",
                    )}
                  >
                    {t("explorer.table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:last-child]:border-b">
                {entries.map((entry) => {
                  const selected = selectedPaths.has(entry.path);

                  return (
                    <TableRow
                      data-state={selected ? "selected" : undefined}
                      key={entry.path}
                    >
                      <TableCell className={explorerSelectionColumnWidthClass}>
                        <Checkbox
                          aria-label={t("explorer.selection.selectRow", {
                            name: entry.name,
                          })}
                          disabled={selectionDisabled}
                          checked={selected}
                          onCheckedChange={(checked) =>
                            onSelectEntry(entry.path, checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="w-[22.5rem] max-w-[22.5rem]">
                        <ExplorerEntryName
                          entry={entry}
                          buildPublicUrl={buildPublicUrl}
                          onOpenDirectory={onOpenDirectory}
                          onUpdateVisibility={onUpdateVisibility}
                        />
                      </TableCell>
                      <TableCell className="max-w-[17.5rem]">
                        <ExplorerEntryUrlCell
                          buildPublicUrl={buildPublicUrl}
                          copyLabel={t("explorer.actions.copyUrl")}
                          entry={entry}
                        />
                      </TableCell>
                      <TableCell
                        className={
                          entry.type === "directory"
                            ? "text-muted-foreground"
                            : undefined
                        }
                      >
                        {entry.type === "directory"
                          ? "-"
                          : formatBytes(entry.size)}
                      </TableCell>
                      <TableCell
                        className={
                          entry.type === "directory"
                            ? "text-muted-foreground"
                            : undefined
                        }
                      >
                        {entry.type === "directory" ? (
                          "-"
                        ) : (
                          <Badge
                            variant={
                              entry.visibility === "public"
                                ? "outline"
                                : "secondary"
                            }
                            className="flex items-center"
                          >
                            {entry.visibility === "public" ? (
                              <>
                                <UnlockIcon />
                                {t("objects.visibility.public")}
                              </>
                            ) : (
                              <>
                                <LockIcon />
                                {t("objects.visibility.private")}
                              </>
                            )}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className={
                          entry.type === "directory"
                            ? "text-muted-foreground"
                            : undefined
                        }
                      >
                        {entry.type === "directory"
                          ? "-"
                          : formatDate(entry.created_at ?? entry.updated_at, locale)}
                      </TableCell>
                      <TableCell>
                        {entry.type === "directory" ? (
                          <ExplorerDirectoryActions
                            bucket={bucket}
                            deletingPath={deletingPath}
                            downloadingFolderPath={downloadingFolderPath}
                            entry={entry}
                            onDeleteFolder={onDeleteFolder}
                            onDownloadFolder={onDownloadFolder}
                            onOpenDirectory={onOpenDirectory}
                            onPublishSite={onPublishSite}
                            publishingPath={publishingPath}
                          />
                        ) : (
                          <ExplorerFileActions
                            bucket={bucket}
                            buildPublicUrl={buildPublicUrl}
                            deletingPath={deletingPath}
                            downloadingFilePath={downloadingFilePath}
                            entry={entry}
                            onDeleteFile={onDeleteFile}
                            onDownloadFile={onDownloadFile}
                            onPublishObjectSite={onPublishObjectSite}
                            onUpdateVisibility={onUpdateVisibility}
                            publishingPath={publishingPath}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </table>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function ExplorerTableColGroup() {
  return (
    <colgroup>
      <col className={explorerSelectionColumnWidthClass} />
      <col className="w-[22.5rem]" />
      <col className="w-[17.5rem]" />
      <col className="w-[7.5rem]" />
      <col className="w-[10rem]" />
      <col className="w-[13.75rem]" />
      <col className="w-[11.25rem]" />
    </colgroup>
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
  onUpdateVisibility: (
    objectKey: string,
    visibility: ObjectVisibility,
  ) => Promise<void>;
}) {
  if (entry.type === "directory") {
    return (
      <Button
        className="px-0 gap-3 flex max-w-full w-fit min-w-0 justify-start items-center font-normal hover:bg-transparent"
        onClick={() => onOpenDirectory(entry.path)}
        type="button"
        variant="ghost"
      >
        <span className="inline-flex size-4 items-center justify-center text-amber-500 [&_svg]:size-4">
          <FileDirectoryFillIcon />
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
          className="px-0 gap-3 flex max-w-full w-fit min-w-0 justify-start items-center font-normal hover:bg-transparent"
          type="button"
          variant="ghost"
        >
          <span className="inline-flex size-4 items-center justify-center text-gray-500 [&_svg]:size-4">
            <FileIcon />
          </span>
          <span className="min-w-0 truncate">{entry.name}</span>
        </Button>
      </FileDetailsButton>
    );
  }

  const exhaustiveEntry: never = entry;
  return exhaustiveEntry;
}

function ExplorerDirectoryActions({
  bucket,
  deletingPath,
  downloadingFolderPath,
  entry,
  onDeleteFolder,
  onDownloadFolder,
  onOpenDirectory,
  onPublishSite,
  publishingPath,
}: {
  bucket: string;
  deletingPath: string;
  downloadingFolderPath: string;
  entry: ExplorerDirectoryEntry;
  onDeleteFolder: (folderPath: string) => Promise<void>;
  onDownloadFolder: (folderPath: string) => Promise<void>;
  onOpenDirectory: (folderPath: string) => void;
  onPublishSite: (folderPath: string, value: PublishSiteValue) => Promise<void>;
  publishingPath: string;
}) {
  const { t } = useI18n();
  const deleting = deletingPath === entry.path;

  return (
    <div className="flex items-center justify-start gap-1">
      <ExplorerIconButton
        label={t("explorer.actions.openFolder")}
        onClick={() => onOpenDirectory(entry.path)}
      >
        <FileDirectoryOpenFillIcon className="text-amber-500" />
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

      <ExplorerOverflowMenu label={t("explorer.actions.more")}>
        <DeleteFolderButton
          bucket={bucket}
          deletingPath={deletingPath}
          entry={entry}
          onDeleteFolder={onDeleteFolder}
          trigger={
            <DropdownMenuItem
              className="cursor-pointer"
              disabled={deleting}
              onSelect={(event) => event.preventDefault()}
              variant="destructive"
            >
              {deleting ? (
                <SyncIcon className="animate-spin" />
              ) : (
                <TrashIcon />
              )}
              {t("explorer.actions.deleteFolder")}
            </DropdownMenuItem>
          }
        />
      </ExplorerOverflowMenu>
    </div>
  );
}

function ExplorerFileActions({
  bucket,
  buildPublicUrl,
  deletingPath,
  downloadingFilePath,
  entry,
  onDeleteFile,
  onDownloadFile,
  onPublishObjectSite,
  onUpdateVisibility,
  publishingPath,
}: {
  bucket: string;
  buildPublicUrl: (objectKey: string) => string;
  deletingPath: string;
  downloadingFilePath: string;
  entry: ExplorerFileEntry;
  onDeleteFile: (objectKey: string) => Promise<void>;
  onDownloadFile: (entry: ExplorerFileEntry) => Promise<void>;
  onPublishObjectSite: (
    objectKey: string,
    value: PublishObjectSiteValue,
  ) => Promise<void>;
  onUpdateVisibility: (
    objectKey: string,
    visibility: ObjectVisibility,
  ) => Promise<void>;
  publishingPath: string;
}) {
  const { t } = useI18n();
  const deleting = deletingPath === entry.object_key;
  const downloading = downloadingFilePath === entry.path;
  const downloadLabel = downloading
    ? t("explorer.actions.downloadingFile")
    : entry.visibility === "public"
      ? t("explorer.actions.directDownload")
      : t("explorer.actions.signedDownload");

  return (
    <div className="flex items-center justify-start gap-1">
      <FileDetailsButton
        buildPublicUrl={buildPublicUrl}
        entry={entry}
        onUpdateVisibility={onUpdateVisibility}
      >
        <ExplorerIconButton label={t("explorer.actions.viewDetails")}>
          <EyeIcon className="text-muted-foreground" />
        </ExplorerIconButton>
      </FileDetailsButton>

      <ExplorerIconButton
        disabled={downloading}
        label={downloadLabel}
        onClick={() => void onDownloadFile(entry)}
      >
        {downloading ? (
          <SyncIcon className="animate-spin text-sky-500" />
        ) : (
          <DownloadIcon className="text-sky-500" />
        )}
      </ExplorerIconButton>

      <PublishObjectSiteButton
        bucket={bucket}
        entry={entry}
        onPublishObjectSite={onPublishObjectSite}
        publishingPath={publishingPath}
      />

      <ExplorerOverflowMenu label={t("explorer.actions.more")}>
        <DeleteFileButton
          bucket={bucket}
          deletingPath={deletingPath}
          entry={entry}
          onDeleteFile={onDeleteFile}
          trigger={
            <DropdownMenuItem
              className="cursor-pointer"
              disabled={deleting}
              onSelect={(event) => event.preventDefault()}
              variant="destructive"
            >
              {deleting ? (
                <SyncIcon className="animate-spin" />
              ) : (
                <TrashIcon />
              )}
              {t("common.delete")}
            </DropdownMenuItem>
          }
        />
      </ExplorerOverflowMenu>
    </div>
  );
}

function ExplorerOverflowMenu({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className="[&_svg]:size-4"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <KebabHorizontalIcon />
          <span className="sr-only">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>{children}</DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExplorerSortHeader({
  activeSortBy,
  label,
  onApply,
  onClear,
  onOpenChange,
  open,
  sortBy,
  sortOrder,
}: {
  activeSortBy: ExplorerSortBy | null;
  label: string;
  onApply: (sortBy: ExplorerSortBy, sortOrder: ExplorerSortOrder) => void;
  onClear: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sortBy: ExplorerSortBy;
  sortOrder: ExplorerSortOrder | null;
}) {
  const { t } = useI18n();
  const active = activeSortBy === sortBy;
  const appliedSortOrder = active ? (sortOrder ?? "asc") : "asc";
  const [draftSortOrder, setDraftSortOrder] = useState<
    ExplorerSortOrder | null
  >(active ? appliedSortOrder : null);
  const triggerState = active
    ? appliedSortOrder === "asc"
      ? t("explorer.sort.state.asc")
      : t("explorer.sort.state.desc")
    : t("explorer.sort.state.none");
  const popoverTitle = t("explorer.sort.popover.title", { label });
  const hasActiveSort = activeSortBy !== null;
  const clearDisabled = !hasActiveSort;
  const Icon = !active
    ? FilterIcon
    : appliedSortOrder === "asc"
      ? SortAscIcon
      : SortDescIcon;

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftSortOrder(active ? appliedSortOrder : null);
  }, [active, appliedSortOrder, open]);

  function handleConfirm() {
    if (!draftSortOrder) {
      toast.error(t("explorer.sort.validation.required"));
      return;
    }

    onApply(sortBy, draftSortOrder);
    onOpenChange(false);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  function handleClear() {
    if (clearDisabled) {
      onOpenChange(false);
      return;
    }

    onClear();
    onOpenChange(false);
  }

  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            aria-label={t("explorer.sort.trigger", {
              label,
              state: triggerState,
            })}
            aria-pressed={active}
            className={cn(
              "size-6 text-muted-foreground hover:text-foreground",
              active && "text-foreground",
            )}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Icon className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={popoverTitle}
          className="w-64 gap-4"
          sideOffset={8}
        >
          <PopoverHeader>
            <PopoverTitle>{popoverTitle}</PopoverTitle>
            <PopoverDescription>
              {t("explorer.sort.popover.description")}
            </PopoverDescription>
          </PopoverHeader>
          <div className="flex flex-col gap-3">
            <ToggleGroup
              aria-label={popoverTitle}
              className="w-full"
              onValueChange={(value) => {
                if (value === "asc" || value === "desc") {
                  setDraftSortOrder(value);
                }
              }}
              type="single"
              value={draftSortOrder ?? ""}
              variant="outline"
            >
              <ToggleGroupItem className="flex-1 cursor-pointer" value="asc">
                {t("explorer.sort.option.asc")}
              </ToggleGroupItem>
              <ToggleGroupItem className="flex-1 cursor-pointer" value="desc">
                {t("explorer.sort.option.desc")}
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="flex items-center justify-between gap-2">
              <Button
                disabled={clearDisabled}
                onClick={handleClear}
                type="button"
                variant="ghost"
              >
                {t("explorer.sort.clear")}
              </Button>
              <div className="flex items-center gap-2">
                <Button onClick={handleCancel} type="button" variant="outline">
                  {t("explorer.sort.cancel")}
                </Button>
                <Button onClick={handleConfirm} type="button">
                  {t("explorer.sort.confirm")}
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
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
      toast.success(t("toast.urlCopied"));
    } catch {
      toast.error(t("errors.copyUrl"));
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
  children: React.ReactNode;
  buildPublicUrl: (objectKey: string) => string;
  entry: ExplorerFileEntry;
  onUpdateVisibility: (
    objectKey: string,
    visibility: ObjectVisibility,
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedVisibility, setSelectedVisibility] =
    useState<ObjectVisibility>(entry.visibility);
  const [currentVisibility, setCurrentVisibility] = useState<ObjectVisibility>(
    entry.visibility,
  );
  const [isSavingVisibility, setIsSavingVisibility] = useState(false);
  const { locale, t } = useI18n();
  const publicUrl =
    currentVisibility === "public" ? buildPublicUrl(entry.object_key) : "";
  const previewType = getPreviewType(entry);
  const markdownPreviewTooLarge =
    previewType === "markdown" && entry.size > MAX_MARKDOWN_PREVIEW_BYTES;

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
      toast.success(t("toast.objectVisibilityUpdated"));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("errors.updateObjectVisibility");
      toast.error(message);
    } finally {
      setIsSavingVisibility(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent
        aria-describedby={undefined}
        className="max-h-[85vh] min-w-0 sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{t("explorer.details.title")}</DialogTitle>
        </DialogHeader>

        <div className="-mr-1 min-w-0 overflow-y-auto pr-1">
          <dl className="grid gap-3">
            <DetailField label={t("explorer.details.preview")}>
              <div className="flex min-w-0 max-w-full flex-col">
                <FilePreview
                  fileName={entry.original_filename}
                  displayMode="inline"
                  markdownPreviewTooLarge={markdownPreviewTooLarge}
                  previewType={previewType}
                  publicUrl={publicUrl}
                />
              </div>
            </DetailField>
            <DetailField label={t("explorer.table.url")} monospace>
              {publicUrl ? (
                <a
                  className="min-w-0 wrap-anywhere text-sky-600 hover:underline"
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
            <DetailField
              label={t("explorer.details.originalFilename")}
              monospace
            >
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    onValueChange={(value) =>
                      setSelectedVisibility(value as ObjectVisibility)
                    }
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
                        <SelectItem value="private">
                          {t("objects.visibility.private")}
                        </SelectItem>
                        <SelectItem value="public">
                          {t("objects.visibility.public")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={
                      isSavingVisibility ||
                      selectedVisibility === currentVisibility
                    }
                    onClick={() => {
                      void handleSaveVisibility();
                    }}
                    type="button"
                    variant="outline"
                  >
                    {isSavingVisibility ? (
                      <SyncIcon
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : null}
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            </DetailField>
            <div className="flex flex-col gap-3 sm:flex-row">
              <DetailField
                className="flex-1"
                label={t("explorer.table.updatedAt")}
              >
                {formatDate(entry.updated_at, locale)}
              </DetailField>
              <DetailField
                className="flex-1"
                label={t("objects.table.createdAt")}
              >
                {formatDate(entry.created_at ?? entry.updated_at, locale)}
              </DetailField>
            </div>
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  children,
  className,
  label,
  monospace,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
  monospace?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border/70 bg-muted/30 p-3",
        className,
      )}
    >
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 min-w-0 text-sm wrap-anywhere",
          monospace && "font-mono",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

type PreviewType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "markdown"
  | "text"
  | null;
type PreviewDisplayMode = "inline" | "fullscreen";
const MAX_MARKDOWN_PREVIEW_BYTES = 100 * 1024;

const openXmlOfficeExtensions = new Set([
  ".docx",
  ".dotx",
  ".docm",
  ".dotm",
  ".xlsx",
  ".xltx",
  ".xlsm",
  ".xltm",
  ".pptx",
  ".potx",
  ".ppsx",
  ".pptm",
  ".potm",
  ".ppsm",
  ".ppam",
]);

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-0 text-xl font-semibold text-foreground">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 text-lg font-semibold text-foreground">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 text-base font-semibold text-foreground">{children}</h3>
  ),
  p: ({ children }) => <p className="leading-7 text-foreground">{children}</p>,
  ul: ({ children }) => (
    <ul className="flex list-disc flex-col gap-2 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-2 pl-5">{children}</ol>
  ),
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
    <th className="border border-border/70 bg-muted/40 px-3 py-2 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border/70 px-3 py-2 align-top">{children}</td>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/60 p-3">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const content = String(children).replace(/\n$/, "");
    const isInline = !className && !content.includes("\n");

    if (isInline) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
          {content}
        </code>
      );
    }

    return (
      <code className={`font-mono text-sm ${className ?? ""}`.trim()}>
        {content}
      </code>
    );
  },
};

function PreviewFullscreenButton({
  fileName,
  markdownPreviewTooLarge = false,
  previewType,
  publicUrl,
}: {
  fileName: string;
  markdownPreviewTooLarge?: boolean;
  previewType: PreviewType;
  publicUrl: string;
}) {
  const { t } = useI18n();
  const label = t("explorer.actions.fullscreenPreview");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className="rounded-full bg-background/75 text-foreground shadow-sm backdrop-blur-sm hover:bg-background/90 hover:shadow-md focus-visible:bg-background/90"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ScreenFullIcon />
          <span className="sr-only">{label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[96vh] w-[96vw] max-w-[1300px] flex-col gap-3 p-5"
      >
        <DialogHeader className="pr-10">
          <DialogTitle>{fileName}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1">
          <FilePreview
            fileName={fileName}
            displayMode="fullscreen"
            markdownPreviewTooLarge={markdownPreviewTooLarge}
            previewType={previewType}
            publicUrl={publicUrl}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilePreview({
  fileName,
  displayMode = "inline",
  markdownPreviewTooLarge = false,
  previewType,
  publicUrl,
}: {
  fileName: string;
  displayMode?: PreviewDisplayMode;
  markdownPreviewTooLarge?: boolean;
  previewType: PreviewType;
  publicUrl: string;
}) {
  const { t } = useI18n();
  const isFullscreen = displayMode === "fullscreen";
  const inlineAction =
    !isFullscreen &&
    previewType !== "audio" &&
    !(previewType === "markdown" && markdownPreviewTooLarge) ? (
      <PreviewFullscreenButton
        fileName={fileName}
        markdownPreviewTooLarge={markdownPreviewTooLarge}
        previewType={previewType}
        publicUrl={publicUrl}
      />
    ) : null;

  if (!publicUrl || !previewType) {
    return (
      <span className="text-muted-foreground">{t("common.notAvailable")}</span>
    );
  }

  const renderInlineSurface = (children: React.ReactNode) => (
    <div
      className="relative min-w-0 max-w-full overflow-hidden rounded-md border border-border/70 bg-background"
      data-testid="inline-preview-surface"
    >
      {inlineAction ? (
        <div className="absolute top-3 right-5 z-10">{inlineAction}</div>
      ) : null}
      {children}
    </div>
  );

  if (previewType === "image") {
    const imagePreview = (
      <img
        alt="file preview"
        className={cn(
          "w-full min-w-0 max-w-full object-contain",
          isFullscreen
            ? "h-full max-h-full rounded-md border border-border/70 bg-background"
            : "max-h-80",
        )}
        src={publicUrl}
      />
    );

    return isFullscreen ? imagePreview : renderInlineSurface(imagePreview);
  }

  if (previewType === "video") {
    const videoPreview = (
      <video
        className={cn(
          "w-full min-w-0 max-w-full",
          isFullscreen
            ? "h-full max-h-full rounded-md border border-border/70 bg-background"
            : "max-h-80",
        )}
        controls
        src={publicUrl}
      />
    );

    return isFullscreen ? videoPreview : renderInlineSurface(videoPreview);
  }

  if (previewType === "audio") {
    return (
      <audio className="w-full min-w-0 max-w-full" controls src={publicUrl} />
    );
  }

  if (previewType === "markdown") {
    return (
      <RemoteTextPreview
        action={inlineAction}
        displayMode={displayMode}
        markdownPreviewTooLarge={markdownPreviewTooLarge}
        mode="markdown"
        publicUrl={publicUrl}
      />
    );
  }

  if (previewType === "text") {
    return (
      <RemoteTextPreview
        action={inlineAction}
        displayMode={displayMode}
        mode="text"
        publicUrl={publicUrl}
      />
    );
  }

  const previewUrl =
    previewType === "pdf"
      ? buildPdfPreviewUrl(publicUrl, displayMode)
      : publicUrl;

  const iframePreview = (
    <iframe
      className={cn(
        "w-full min-w-0 max-w-full bg-background",
        isFullscreen
          ? "h-full min-h-0 rounded-md border border-border/70"
          : "h-80",
      )}
      src={previewUrl}
      title="file preview"
    />
  );

  return isFullscreen ? iframePreview : renderInlineSurface(iframePreview);
}

function buildPdfPreviewUrl(
  publicUrl: string,
  displayMode: PreviewDisplayMode,
) {
  const params =
    displayMode === "fullscreen"
      ? "toolbar=0&navpanes=0&pagemode=none&zoom=page-width"
      : "toolbar=0&navpanes=0&pagemode=none&view=Fit&zoom=page-fit";
  const separator = publicUrl.includes("#") ? "&" : "#";

  return `${publicUrl}${separator}${params}`;
}

function RemoteTextPreview({
  action,
  displayMode,
  markdownPreviewTooLarge = false,
  mode,
  publicUrl,
}: {
  action?: React.ReactNode;
  displayMode: PreviewDisplayMode;
  markdownPreviewTooLarge?: boolean;
  mode: "markdown" | "text";
  publicUrl: string;
}) {
  const { t } = useI18n();
  const [previewText, setPreviewText] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (mode === "markdown" && markdownPreviewTooLarge) {
      setPreviewText("");
      setStatus("ready");
      return;
    }

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
  }, [markdownPreviewTooLarge, mode, publicUrl]);

  if (mode === "markdown" && markdownPreviewTooLarge) {
    const tooLargeMessage = t("explorer.preview.markdownTooLarge");

    if (displayMode === "inline") {
      return (
        <div
          className="relative min-w-0 max-w-full rounded-md border border-border/70 bg-background p-4"
          data-testid="inline-preview-surface"
        >
          {action ? (
            <div className="absolute top-3 right-5 z-10">{action}</div>
          ) : null}
          <span className="text-muted-foreground">{tooLargeMessage}</span>
        </div>
      );
    }

    return <span className="text-muted-foreground">{tooLargeMessage}</span>;
  }

  if (status === "loading") {
    if (displayMode === "inline") {
      return (
        <div
          className="relative min-w-0 max-w-full rounded-md border border-border/70 bg-background p-4 pt-12"
          data-testid="inline-preview-surface"
        >
          {action ? (
            <div className="absolute top-3 right-5 z-10">{action}</div>
          ) : null}
          <span className="text-muted-foreground">{t("common.loading")}</span>
        </div>
      );
    }

    return <span className="text-muted-foreground">{t("common.loading")}</span>;
  }

  if (status === "error") {
    if (displayMode === "inline") {
      return (
        <div
          className="relative min-w-0 max-w-full rounded-md border border-border/70 bg-background p-4 pt-12"
          data-testid="inline-preview-surface"
        >
          {action ? (
            <div className="absolute top-3 right-5 z-10">{action}</div>
          ) : null}
          <span className="text-muted-foreground">
            {t("common.notAvailable")}
          </span>
        </div>
      );
    }

    return (
      <span className="text-muted-foreground">{t("common.notAvailable")}</span>
    );
  }

  if (mode === "markdown") {
    if (displayMode === "inline") {
      return (
        <div
          className="relative min-w-0 max-w-full rounded-md border border-border/70 bg-background"
          data-testid="inline-preview-surface"
        >
          {action ? (
            <div className="absolute top-3 right-5 z-10">{action}</div>
          ) : null}
          <div className="max-h-80 min-w-0 max-w-full overflow-auto p-4 pt-12">
            <div className="flex min-w-0 flex-col gap-4 text-sm">
              <ReactMarkdown
                components={markdownComponents}
                remarkPlugins={[remarkGfm]}
                skipHtml
              >
                {previewText}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full min-h-0 min-w-0 max-w-full overflow-auto rounded-md border border-border/70 bg-background p-4">
        <div className="flex min-w-0 flex-col gap-4 text-sm">
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

  if (displayMode === "inline") {
    return (
      <div
        className="relative min-w-0 max-w-full rounded-md border border-border/70 bg-background"
        data-testid="inline-preview-surface"
      >
        {action ? (
          <div className="absolute top-3 right-5 z-10">{action}</div>
        ) : null}
        <div className="max-h-80 min-w-0 max-w-full overflow-auto">
          <pre className="w-full min-w-0 max-w-full p-3 pt-12 font-mono text-sm whitespace-pre-wrap wrap-break-word">
            {previewText}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <pre className="h-full min-h-0 w-full min-w-0 max-w-full overflow-auto rounded-md border border-border/70 bg-background p-3 font-mono text-sm whitespace-pre-wrap wrap-break-word">
      {previewText}
    </pre>
  );
}

function getPreviewType(entry: ExplorerFileEntry): PreviewType {
  const contentType = entry.content_type.toLowerCase();
  const mimeType = contentType.split(";")[0]?.trim() ?? "";
  const name = entry.original_filename.toLowerCase();

  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    mimeType.includes("markdown") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown")
  ) {
    return "markdown";
  }
  if (
    mimeType.startsWith("application/vnd.openxmlformats-officedocument.") ||
    isOpenXmlOfficeExtension(name)
  ) {
    return null;
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType === "application/xml" ||
    mimeType.endsWith("+xml") ||
    mimeType.includes("javascript") ||
    mimeType.includes("sql") ||
    name.endsWith(".log")
  ) {
    return "text";
  }

  return null;
}

function isOpenXmlOfficeExtension(name: string) {
  return Array.from(openXmlOfficeExtensions).some((extension) =>
    name.endsWith(extension),
  );
}

function DeleteFolderButton({
  bucket,
  deletingPath,
  entry,
  onDeleteFolder,
  trigger,
}: {
  bucket: string;
  deletingPath: string;
  entry: ExplorerDirectoryEntry;
  onDeleteFolder: (folderPath: string) => Promise<void>;
  trigger?: React.ReactNode;
}) {
  const { t } = useI18n();
  const label = t("explorer.actions.deleteFolder");
  const pending = deletingPath === entry.path;

  return (
    <AlertDialog>
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <AlertDialogTrigger asChild>
                <ExplorerIconActionButton disabled={pending} label={label}>
                  {pending ? (
                    <SyncIcon className="animate-spin text-destructive" />
                  ) : (
                    <TrashIcon className="text-destructive" />
                  )}
                </ExplorerIconActionButton>
              </AlertDialogTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent
            className="whitespace-nowrap leading-none"
            sideOffset={6}
          >
            {label}
          </TooltipContent>
        </Tooltip>
      )}
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ShieldIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("explorer.deleteFolder.title")}
          </AlertDialogTitle>
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
        <SyncIcon className="animate-spin text-sky-500" />
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
  const label = t("explorer.actions.publishSite");

  return (
    <PublishSiteDialog
      bucket={bucket}
      onSubmit={(value) => onPublishSite(entry.path, value)}
      pending={pending}
      prefix={entry.path}
      trigger={
        <ExplorerIconActionButton disabled={pending} label={label}>
          {pending ? (
            <SyncIcon className="animate-spin text-emerald-500" />
          ) : (
            <GlobeIcon className="text-emerald-500" />
          )}
        </ExplorerIconActionButton>
      }
      triggerTooltipLabel={label}
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
  onPublishObjectSite: (
    objectKey: string,
    value: PublishObjectSiteValue,
  ) => Promise<void>;
  publishingPath: string;
}) {
  const { t } = useI18n();
  const pending = publishingPath === entry.path;
  const label = t("explorer.actions.publishSite");

  return (
    <PublishObjectSiteDialog
      bucket={bucket}
      objectKey={entry.object_key}
      onSubmit={(value) => onPublishObjectSite(entry.object_key, value)}
      pending={pending}
      trigger={
        <ExplorerIconActionButton disabled={pending} label={label}>
          {pending ? (
            <SyncIcon className="animate-spin text-emerald-500" />
          ) : (
            <GlobeIcon className="text-emerald-500" />
          )}
        </ExplorerIconActionButton>
      }
      triggerTooltipLabel={label}
    />
  );
}

function DeleteFileButton({
  bucket,
  deletingPath,
  entry,
  onDeleteFile,
  trigger,
}: {
  bucket: string;
  deletingPath: string;
  entry: ExplorerFileEntry;
  onDeleteFile: (objectKey: string) => Promise<void>;
  trigger?: React.ReactNode;
}) {
  const { t } = useI18n();
  const label = t("common.delete");
  const pending = deletingPath === entry.object_key;

  return (
    <AlertDialog>
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <AlertDialogTrigger asChild>
                <ExplorerIconActionButton disabled={pending} label={label}>
                  {pending ? (
                    <SyncIcon className="animate-spin text-destructive" />
                  ) : (
                    <TrashIcon className="text-destructive" />
                  )}
                </ExplorerIconActionButton>
              </AlertDialogTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent
            className="whitespace-nowrap leading-none"
            sideOffset={6}
          >
            {label}
          </TooltipContent>
        </Tooltip>
      )}
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ShieldIcon />
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

const ExplorerIconButton = forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode;
    disabled?: boolean;
    label: string;
    onClick?: () => void;
  }
>(function ExplorerIconButton({ children, disabled, label, onClick }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <ExplorerIconActionButton
            ref={ref}
            disabled={disabled}
            label={label}
            onClick={onClick}
          >
            {children}
          </ExplorerIconActionButton>
        </span>
      </TooltipTrigger>
      <TooltipContent className="whitespace-nowrap leading-none" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
});

const ExplorerIconActionButton = forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode;
    disabled?: boolean;
    label: string;
    onClick?: () => void;
  }
>(function ExplorerIconActionButton(
  { children, disabled, label, onClick },
  ref,
) {
  return (
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
  );
});
