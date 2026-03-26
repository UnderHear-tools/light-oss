import {
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import type { ExplorerDirectoryEntry, ExplorerEntry, ExplorerFileEntry } from "@/api/types";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function ExplorerTable({
  bucket,
  buildPublicUrl,
  deletingPath,
  entries,
  onDeleteFile,
  onDeleteFolder,
  onOpenDirectory,
  onSignDownload,
  signingPath,
}: {
  bucket: string;
  buildPublicUrl: (objectKey: string) => string;
  deletingPath: string;
  entries: ExplorerEntry[];
  onDeleteFile: (objectKey: string) => Promise<void>;
  onDeleteFolder: (folderPath: string) => Promise<void>;
  onOpenDirectory: (folderPath: string) => void;
  onSignDownload: (objectKey: string) => Promise<void>;
  signingPath: string;
}) {
  const { locale, t } = useI18n();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("explorer.table.name")}</TableHead>
          <TableHead className="w-[120px]">{t("explorer.table.size")}</TableHead>
          <TableHead className="w-[160px]">{t("explorer.table.storageType")}</TableHead>
          <TableHead className="w-[220px]">{t("explorer.table.updatedAt")}</TableHead>
          <TableHead className="w-[180px] text-right">
            {t("explorer.table.actions")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) =>
          entry.type === "directory" ? (
            <TableRow key={entry.path}>
              <TableCell className="max-w-[360px]">
                <Button
                  className="min-w-0 justify-start gap-2 px-0 font-normal hover:bg-transparent"
                  onClick={() => onOpenDirectory(entry.path)}
                  type="button"
                  variant="ghost"
                >
                  <span className="inline-flex size-5 items-center justify-center text-amber-500 [&_svg]:size-5">
                    <FolderIcon data-icon="inline-start" />
                  </span>
                  <span className="truncate">{entry.name}</span>
                </Button>
              </TableCell>
              <TableCell className="text-muted-foreground">-</TableCell>
              <TableCell className="text-muted-foreground">-</TableCell>
              <TableCell className="text-muted-foreground">-</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <ExplorerIconButton
                    label={t("explorer.actions.openFolder")}
                    onClick={() => onOpenDirectory(entry.path)}
                  >
                    <FolderOpenIcon />
                  </ExplorerIconButton>

                  {entry.is_empty ? (
                    <DeleteFolderButton
                      bucket={bucket}
                      deletingPath={deletingPath}
                      entry={entry}
                      onDeleteFolder={onDeleteFolder}
                    />
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            <TableRow key={entry.path}>
              <TableCell className="max-w-[360px]">
                <div className="flex items-center gap-2">
                  <FileTextIcon className="size-4 text-muted-foreground" />
                  <span className="truncate">{entry.name}</span>
                </div>
              </TableCell>
              <TableCell>{formatBytes(entry.size)}</TableCell>
              <TableCell>
                <Badge variant={entry.visibility === "public" ? "secondary" : "outline"}>
                  {entry.visibility === "public"
                    ? t("objects.visibility.public")
                    : t("objects.visibility.private")}
                </Badge>
              </TableCell>
              <TableCell>{formatDate(entry.updated_at, locale)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  {entry.visibility === "public" ? (
                    <ExplorerIconLink
                      href={buildPublicUrl(entry.object_key)}
                      label={t("explorer.actions.directDownload")}
                    >
                      <DownloadIcon />
                    </ExplorerIconLink>
                  ) : (
                    <ExplorerIconButton
                      disabled={signingPath === entry.path}
                      label={t("explorer.actions.signedDownload")}
                      onClick={() => void onSignDownload(entry.object_key)}
                    >
                      {signingPath === entry.path ? (
                        <LoaderCircleIcon className="animate-spin" />
                      ) : (
                        <DownloadIcon />
                      )}
                    </ExplorerIconButton>
                  )}

                  <DeleteFileButton
                    bucket={bucket}
                    deletingPath={deletingPath}
                    entry={entry}
                    onDeleteFile={onDeleteFile}
                  />
                </div>
              </TableCell>
            </TableRow>
          ),
        )}
      </TableBody>
    </Table>
  );
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
        <span>
          <ExplorerIconButton
            disabled={deletingPath === entry.path}
            label={t("explorer.actions.deleteFolder")}
            onClick={() => undefined}
          >
            {deletingPath === entry.path ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <Trash2Icon />
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
        <span>
          <ExplorerIconButton
            disabled={deletingPath === entry.object_key}
            label={t("common.delete")}
            onClick={() => undefined}
          >
            {deletingPath === entry.object_key ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <Trash2Icon />
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

function ExplorerIconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            disabled={disabled}
            onClick={onClick}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            {children}
            <span className="sr-only">{label}</span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

function ExplorerIconLink({
  children,
  href,
  label,
}: {
  children: React.ReactNode;
  href: string;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild size="icon-xs" variant="ghost">
          <a href={href} rel="noreferrer" target="_blank">
            {children}
            <span className="sr-only">{label}</span>
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}
