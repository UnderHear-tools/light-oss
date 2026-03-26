import { FormEvent, useState } from "react";
import { LoaderCircleIcon, UploadIcon } from "lucide-react";
import type { ObjectVisibility } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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

export interface UploadFormValue {
  objectKey: string;
  file: File;
  visibility: ObjectVisibility;
}

export function UploadPanel({
  pending,
  progress,
  onSubmit,
}: {
  pending: boolean;
  progress: number;
  onSubmit: (value: UploadFormValue) => Promise<void>;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [objectKey, setObjectKey] = useState("");
  const [visibility, setVisibility] = useState<ObjectVisibility>("private");
  const { t } = useI18n();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    const form = event.currentTarget;
    const key = objectKey.trim() || selectedFile.name;
    await onSubmit({
      objectKey: key,
      file: selectedFile,
      visibility,
    });

    setSelectedFile(null);
    setObjectKey("");
    setVisibility("private");
    const input = form.elements.namedItem(
      "upload-file",
    ) as HTMLInputElement | null;
    if (input) {
      input.value = "";
    }
  }

  return (
    <Card className="border-border/70 bg-card">
      <CardHeader>
        <CardTitle>{t("objects.upload.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("objects.upload.description")}
        </p>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-5">
          <FieldGroup>
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
              <FieldLabel htmlFor="object-key">
                {t("objects.form.objectKey.label")}
              </FieldLabel>
              <Input
                disabled={pending}
                id="object-key"
                onChange={(event) => setObjectKey(event.target.value)}
                placeholder={t("objects.form.objectKey.placeholder")}
                value={objectKey}
              />
              <FieldDescription>
                {t("objects.form.objectKey.description")}
              </FieldDescription>
            </Field>

            <Field data-disabled={pending || undefined}>
              <FieldLabel>{t("objects.form.visibility.label")}</FieldLabel>
              <Select
                onValueChange={(value) => setVisibility(value as ObjectVisibility)}
                value={visibility}
              >
                <SelectTrigger
                  aria-label={t("objects.form.visibility.label")}
                  className="w-full"
                  disabled={pending}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
        </CardContent>
        <CardFooter className="justify-end">
          <Button disabled={pending || !selectedFile} type="submit">
            {pending ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <UploadIcon data-icon="inline-start" />
            )}
            {pending ? t("objects.form.submitting") : t("objects.form.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
