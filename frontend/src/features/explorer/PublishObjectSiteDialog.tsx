import type { ReactNode } from "react";
import { SiteFormDialog } from "@/features/sites/SiteFormDialog";
import { useI18n } from "@/lib/i18n";

export interface PublishObjectSiteValue {
  domains: string[];
  enabled: boolean;
  errorDocument: string;
  spaFallback: boolean;
}

export function PublishObjectSiteDialog({
  bucket,
  objectKey,
  pending,
  onSubmit,
  trigger,
}: {
  bucket: string;
  objectKey: string;
  pending: boolean;
  onSubmit: (value: PublishObjectSiteValue) => Promise<void>;
  trigger?: ReactNode;
}) {
  const { t } = useI18n();
  const { indexDocument, rootPrefix } = resolveSiteLocation(objectKey);

  return (
    <SiteFormDialog
      description={t("sites.publishObject.description")}
      initialValue={{
        bucket,
        rootPrefix,
        domains: [],
        enabled: true,
        indexDocument,
        errorDocument: "",
        spaFallback: true,
      }}
      lockedFields={{ bucket: true, rootPrefix: true, indexDocument: true }}
      mode="create"
      onSubmit={(value) =>
        onSubmit({
          domains: value.domains,
          enabled: value.enabled,
          errorDocument: value.errorDocument,
          spaFallback: value.spaFallback,
        })
      }
      pending={pending}
      submitLabel={t("explorer.actions.publishSite")}
      title={t("sites.publishObject.title")}
      trigger={trigger}
    />
  );
}

function resolveSiteLocation(objectKey: string) {
  const lastSlashIndex = objectKey.lastIndexOf("/");
  if (lastSlashIndex < 0) {
    return {
      rootPrefix: "",
      indexDocument: objectKey,
    };
  }

  return {
    rootPrefix: objectKey.slice(0, lastSlashIndex + 1),
    indexDocument: objectKey.slice(lastSlashIndex + 1),
  };
}
