import { FormEvent, useState } from "react";
import { FolderPlusIcon, LoaderCircleIcon } from "lucide-react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

export function CreateFolderDialog({
  currentPrefix,
  onSubmit,
  pending,
}: {
  currentPrefix: string;
  onSubmit: (name: string) => Promise<void>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { t } = useI18n();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    await onSubmit(name.trim());
    setName("");
    setOpen(false);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <FolderPlusIcon data-icon="inline-start" />
          {t("explorer.toolbar.newFolder")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("explorer.createFolder.title")}</DialogTitle>
          <DialogDescription>
            {t("explorer.createFolder.description")}
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
              <FieldLabel htmlFor="new-folder-name">
                {t("explorer.createFolder.nameLabel")}
              </FieldLabel>
              <Input
                disabled={pending}
                id="new-folder-name"
                onChange={(event) => setName(event.target.value)}
                placeholder={t("explorer.createFolder.namePlaceholder")}
                value={name}
              />
              <FieldDescription>
                {t("explorer.createFolder.nameDescription")}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button disabled={pending || !name.trim()} type="submit">
              {pending ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <FolderPlusIcon data-icon="inline-start" />
              )}
              {pending
                ? t("explorer.createFolder.submitting")
                : t("explorer.createFolder.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
