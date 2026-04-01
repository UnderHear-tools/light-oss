import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { GlobeIcon, LoaderCircleIcon, UploadIcon } from "lucide-react";
import type { Bucket } from "@/api/types";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getFolderUploadTopLevelName,
  normalizeFolderUploadParentPrefix,
} from "@/lib/folder-upload";
import { useI18n } from "@/lib/i18n";

const folderInputAttributes: Record<string, string> = {
  directory: "",
  webkitdirectory: "",
};

const emptyBuckets: Bucket[] = [];

export interface UploadAndPublishSiteValue {
  bucket: string;
  parentPrefix: string;
  files: File[];
  domains: string[];
  enabled: boolean;
  indexDocument: string;
  errorDocument: string;
  spaFallback: boolean;
}

export function UploadAndPublishSiteDialog({
  buckets,
  bucket,
  parentPrefix,
  lockedFields,
  onSubmit,
  pending,
  progress,
  trigger,
}: {
  buckets?: Bucket[];
  bucket?: string;
  parentPrefix?: string;
  lockedFields?: {
    bucket?: boolean;
    parentPrefix?: boolean;
  };
  onSubmit: (value: UploadAndPublishSiteValue) => Promise<void>;
  pending: boolean;
  progress: number;
  trigger?: ReactNode;
}) {
  const resolvedBuckets = buckets ?? emptyBuckets;
  const [open, setOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState(bucket ?? "");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [parentPrefixValue, setParentPrefixValue] = useState(
    parentPrefix ?? "",
  );
  const [domainsInput, setDomainsInput] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [indexDocument, setIndexDocument] = useState("index.html");
  const [errorDocument, setErrorDocument] = useState("");
  const [spaFallback, setSpaFallback] = useState(true);
  const { t } = useI18n();
  const bucketLocked = lockedFields?.bucket ?? false;
  const parentPrefixLocked = lockedFields?.parentPrefix ?? false;

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextBucket =
      bucket?.trim() ||
      (resolvedBuckets.length > 0 ? resolvedBuckets[0].name : "");

    setSelectedBucket(nextBucket);
    setSelectedFiles([]);
    setParentPrefixValue(parentPrefix ?? "");
    setDomainsInput("");
    setEnabled(true);
    setIndexDocument("index.html");
    setErrorDocument("");
    setSpaFallback(true);
  }, [bucket, open, parentPrefix, resolvedBuckets]);

  const parsedDomains = domainsInput
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const normalizedParentPrefix =
    normalizeFolderUploadParentPrefix(parentPrefixValue);
  const topLevelFolderName = getFolderUploadTopLevelName(selectedFiles);
  const rootPrefixPreview = topLevelFolderName
    ? `${normalizedParentPrefix}${topLevelFolderName}/`
    : "";
  const canSubmit =
    selectedBucket.trim() !== "" &&
    selectedFiles.length > 0 &&
    parsedDomains.length > 0 &&
    topLevelFolderName !== "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    try {
      await onSubmit({
        bucket: selectedBucket.trim(),
        parentPrefix: normalizedParentPrefix,
        files: selectedFiles,
        domains: parsedDomains,
        enabled,
        indexDocument: indexDocument.trim() || "index.html",
        errorDocument: errorDocument.trim(),
        spaFallback,
      });

      setOpen(false);
    } catch {
      return;
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline">
            <UploadIcon data-icon="inline-start" />
            {t("sites.actions.uploadAndPublish")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("sites.uploadPublish.title")}</DialogTitle>
          <DialogDescription>
            {t("sites.uploadPublish.description")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-publish-bucket">
                {t("sites.form.bucket")}
              </FieldLabel>
              {bucketLocked ? (
                <div className="rounded-lg border border-border/70 bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {selectedBucket}
                </div>
              ) : resolvedBuckets.length > 0 ? (
                <Select
                  onValueChange={setSelectedBucket}
                  value={selectedBucket}
                >
                  <SelectTrigger
                    aria-label={t("sites.form.bucket")}
                    className="w-full"
                    disabled={pending}
                    id="upload-publish-bucket"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {resolvedBuckets.map((item) => (
                      <SelectItem key={item.name} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-lg border border-border/70 bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {t("common.noData")}
                </div>
              )}
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-publish-parent-prefix">
                {t("sites.uploadPublish.parentPrefix")}
              </FieldLabel>
              {parentPrefixLocked ? (
                <div className="rounded-lg border border-border/70 bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {normalizedParentPrefix || t("explorer.rootFolder")}
                </div>
              ) : (
                <Input
                  disabled={pending}
                  id="upload-publish-parent-prefix"
                  onChange={(event) => setParentPrefixValue(event.target.value)}
                  placeholder="deployments/"
                  value={parentPrefixValue}
                />
              )}
              <FieldDescription>
                {t("sites.uploadPublish.parentPrefixDescription")}
              </FieldDescription>
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-publish-folder">
                {t("sites.uploadPublish.folderLabel")}
              </FieldLabel>
              <Input
                {...folderInputAttributes}
                disabled={pending}
                id="upload-publish-folder"
                multiple
                name="upload-publish-folder"
                onChange={(event) =>
                  setSelectedFiles(Array.from(event.target.files ?? []))
                }
                type="file"
              />
              <FieldDescription>
                {t("sites.uploadPublish.folderDescription")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("sites.uploadPublish.rootPreview")}</FieldLabel>
              <div className="rounded-lg border border-border/70 bg-muted px-3 py-2 text-sm text-muted-foreground">
                {rootPrefixPreview ||
                  t("sites.uploadPublish.rootPreviewPlaceholder")}
              </div>
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-publish-domains">
                {t("sites.form.domains")}
              </FieldLabel>
              <Input
                disabled={pending}
                id="upload-publish-domains"
                onChange={(event) => setDomainsInput(event.target.value)}
                placeholder="demo.underhear.cn, www.underhear.cn"
                value={domainsInput}
              />
              <FieldDescription>
                {t("sites.form.domainsDescription")}
              </FieldDescription>
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-publish-enabled">
                {t("sites.form.enabled")}
              </FieldLabel>
              <Select
                onValueChange={(value) => setEnabled(value === "true")}
                value={String(enabled)}
              >
                <SelectTrigger
                  aria-label={t("sites.form.enabled")}
                  className="w-full"
                  disabled={pending}
                  id="upload-publish-enabled"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{t("common.enabled")}</SelectItem>
                  <SelectItem value="false">{t("common.disabled")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-publish-index-document">
                {t("sites.form.indexDocument")}
              </FieldLabel>
              <Input
                disabled={pending}
                id="upload-publish-index-document"
                onChange={(event) => setIndexDocument(event.target.value)}
                value={indexDocument}
              />
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-publish-error-document">
                {t("sites.form.errorDocument")}
              </FieldLabel>
              <Input
                disabled={pending}
                id="upload-publish-error-document"
                onChange={(event) => setErrorDocument(event.target.value)}
                placeholder="404.html"
                value={errorDocument}
              />
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="upload-publish-spa-fallback">
                {t("sites.form.spaFallback")}
              </FieldLabel>
              <Select
                onValueChange={(value) => setSpaFallback(value === "true")}
                value={String(spaFallback)}
              >
                <SelectTrigger
                  aria-label={t("sites.form.spaFallback")}
                  className="w-full"
                  disabled={pending}
                  id="upload-publish-spa-fallback"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{t("common.enabled")}</SelectItem>
                  <SelectItem value="false">{t("common.disabled")}</SelectItem>
                </SelectContent>
              </Select>
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
            <Button disabled={pending || !canSubmit} type="submit">
              {pending ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <GlobeIcon data-icon="inline-start" />
              )}
              {pending
                ? t("objects.form.submitting")
                : t("sites.uploadPublish.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
