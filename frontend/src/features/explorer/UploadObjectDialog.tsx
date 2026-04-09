import { FormEvent, useEffect, useState } from "react";
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

export interface UploadDialogValue {
  objectKey: string;
  file: File;
  visibility: ObjectVisibility;
}

export function UploadObjectDialog({
  currentPrefix,
  onSubmit,
  pending,
  progress,
  resetSignal,
}: {
  currentPrefix: string;
  onSubmit: (value: UploadDialogValue) => Promise<void>;
  pending: boolean;
  progress: number;
  resetSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [objectKey, setObjectKey] = useState("");
  const [visibility, setVisibility] = useState<ObjectVisibility>("private");
  const { t } = useI18n();

  function resetDialogState() {
    setSelectedFile(null);
    setObjectKey("");
    setVisibility("private");
    setOpen(false);
  }

  useEffect(() => {
    if (typeof resetSignal === "number") {
      resetDialogState();
    }
  }, [resetSignal]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    try {
      await onSubmit({
        objectKey: objectKey.trim() || selectedFile.name,
        file: selectedFile,
        visibility,
      });

      resetDialogState();
    } catch {
      return;
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button disabled={pending} type="button">
          <UploadIcon />
          {t("explorer.toolbar.upload")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("explorer.upload.title")}</DialogTitle>
          <DialogDescription>
            {t("explorer.upload.description")}
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
              <FieldLabel htmlFor="upload-file">
                {t("objects.form.file.label")}
              </FieldLabel>
              <Input
                disabled={pending}
                id="upload-file"
                name="upload-file"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] ?? null)
                }
                type="file"
              />
              <FieldDescription>
                {t("objects.form.file.description")}
              </FieldDescription>
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-object-key">
                {t("explorer.upload.objectNameLabel")}
              </FieldLabel>
              <Input
                disabled={pending}
                id="upload-object-key"
                onChange={(event) => setObjectKey(event.target.value)}
                placeholder={t("explorer.upload.objectNamePlaceholder")}
                value={objectKey}
              />
              <FieldDescription>
                {t("objects.form.objectKey.description")}
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
            <Button disabled={pending || !selectedFile} type="submit">
              {pending ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <UploadIcon />
              )}
              {pending
                ? t("objects.form.submitting")
                : t("explorer.upload.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
