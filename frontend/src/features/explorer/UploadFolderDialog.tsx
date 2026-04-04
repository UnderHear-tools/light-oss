import { FormEvent, useState } from "react";
import { LoaderCircleIcon, UploadIcon } from "lucide-react";
import type { ObjectVisibility } from "@/api/types";
import { Button } from "@/components/ui/button";
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

const folderInputAttributes: Record<string, string> = {
  directory: "",
  webkitdirectory: "",
};

export interface UploadFolderDialogValue {
  files: File[];
  visibility: ObjectVisibility;
}

export function UploadFolderDialog({
  currentPrefix,
  onSubmit,
  pending,
  progress,
}: {
  currentPrefix: string;
  onSubmit: (value: UploadFolderDialogValue) => Promise<void>;
  pending: boolean;
  progress: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [visibility, setVisibility] = useState<ObjectVisibility>("private");
  const { t } = useI18n();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFiles.length === 0) {
      return;
    }

    const form = event.currentTarget;
    try {
      await onSubmit({
        files: selectedFiles,
        visibility,
      });

      setSelectedFiles([]);
      setVisibility("private");
      setOpen(false);

      const input = form.elements.namedItem(
        "upload-folder",
      ) as HTMLInputElement | null;
      if (input) {
        input.value = "";
      }
    } catch {
      return;
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button disabled={pending} type="button" variant="outline">
          <UploadIcon data-icon="inline-start" />
          {t("explorer.toolbar.uploadFolder")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("explorer.folderUpload.title")}</DialogTitle>
          <DialogDescription>
            {t("explorer.folderUpload.description")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>{t("explorer.currentFolder")}</FieldLabel>
              <div className="rounded-lg border border-border/70 bg-muted px-3 py-2 text-sm text-muted-foreground">
                {currentPrefix || t("explorer.rootFolder")}
              </div>
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-folder">
                {t("explorer.folderUpload.folderLabel")}
              </FieldLabel>
              <Input
                {...folderInputAttributes}
                disabled={pending}
                id="upload-folder"
                multiple
                name="upload-folder"
                onChange={(event) =>
                  setSelectedFiles(Array.from(event.target.files ?? []))
                }
                type="file"
              />
              <FieldDescription>
                {t("explorer.folderUpload.folderDescription")}
              </FieldDescription>
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel>{t("objects.form.visibility.label")}</FieldLabel>
              <Select
                onValueChange={(value) =>
                  setVisibility(value as ObjectVisibility)
                }
                value={visibility}
              >
                <SelectTrigger
                  aria-label={t("objects.form.visibility.label")}
                  className="w-full"
                  disabled={pending}
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
              <FieldDescription>
                {t("objects.form.visibility.description")}
              </FieldDescription>
            </Field>
          </FieldGroup>

          {pending ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{t("objects.progress.label")}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              disabled={pending || selectedFiles.length === 0}
              type="submit"
            >
              {pending ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <UploadIcon data-icon="inline-start" />
              )}
              {pending
                ? t("objects.form.submitting")
                : t("explorer.folderUpload.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
