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
  pending,
  onSubmit,
  trigger,
}: {
  bucket: string;
  prefix: string;
  pending: boolean;
  onSubmit: (value: PublishSiteValue) => Promise<void>;
  trigger?: ReactNode;
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
      onSubmit={(value) =>
        onSubmit({
          domains: value.domains,
          enabled: value.enabled,
          indexDocument: value.indexDocument,
          errorDocument: value.errorDocument,
          spaFallback: value.spaFallback,
        })
      }
      pending={pending}
      submitLabel={t("explorer.actions.publishSite")}
      title={t("sites.publish.title")}
      trigger={trigger}
    />
  );
}
