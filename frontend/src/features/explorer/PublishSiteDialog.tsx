import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { SiteFormDialog } from "@/features/sites/SiteFormDialog";

export interface PublishSiteValue {
  domains: string[];
  enabled: boolean;
  indexDocument: string;
  errorDocument: string;
  spaFallback: boolean;
}

export function PublishSiteDialog({
  bucket,
  prefix,
  open,
  pending,
  onOpenChange,
  onSubmit,
  trigger,
  triggerTooltipLabel,
}: {
  bucket: string;
  prefix: string;
  open?: boolean;
  pending: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (value: PublishSiteValue) => Promise<void>;
  trigger?: ReactNode;
  triggerTooltipLabel?: string;
}) {
  const { t } = useI18n();

  return (
    <SiteFormDialog
      description={t("sites.publish.description")}
      initialValue={{
        bucket,
        rootPrefix: prefix,
        domains: [],
        enabled: true,
        indexDocument: "index.html",
        errorDocument: "",
        spaFallback: true,
      }}
      lockedFields={{ bucket: true, rootPrefix: true }}
      mode="create"
      onOpenChange={onOpenChange}
      onSubmit={(value) =>
        onSubmit({
          domains: value.domains,
          enabled: value.enabled,
          indexDocument: value.indexDocument,
          errorDocument: value.errorDocument,
          spaFallback: value.spaFallback,
        })
      }
      open={open}
      pending={pending}
      submitLabel={t("explorer.actions.publishSite")}
      title={t("sites.publish.title")}
      trigger={trigger}
      triggerTooltipLabel={triggerTooltipLabel}
    />
  );
}
