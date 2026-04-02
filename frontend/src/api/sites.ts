import type { AxiosProgressEvent } from "axios";
import { ApiError, apiRequest, createApiClient } from "./client";
import type {
  CreateSiteRequest,
  PublishSiteResult,
  Site,
  SiteListResult,
  UpdateSiteRequest,
} from "./types";
import type { AppSettings } from "../lib/settings";
import { buildFolderUploadManifest } from "../lib/folder-upload";

export interface UploadAndPublishSiteParams {
  bucket: string;
  parentPrefix: string;
  files: File[];
  domains: string[];
  enabled: boolean;
  indexDocument: string;
  errorDocument: string;
  spaFallback: boolean;
  onProgress?: (value: number) => void;
}

export interface PublishObjectSiteParams {
  bucket: string;
  objectKey: string;
  domains: string[];
  enabled: boolean;
  errorDocument: string;
  spaFallback: boolean;
}

export function listSites(settings: AppSettings) {
  return apiRequest<SiteListResult>(settings, {
    method: "GET",
    url: "/api/v1/sites",
  });
}

export function createSite(settings: AppSettings, payload: CreateSiteRequest) {
  return apiRequest<Site>(settings, {
    method: "POST",
    url: "/api/v1/sites",
    data: payload,
  });
}

export function updateSite(
  settings: AppSettings,
  siteId: number,
  payload: UpdateSiteRequest,
) {
  return apiRequest<Site>(settings, {
    method: "PUT",
    url: `/api/v1/sites/${siteId}`,
    data: payload,
  });
}

export function deleteSite(settings: AppSettings, siteId: number) {
  return apiRequest<null>(settings, {
    method: "DELETE",
    url: `/api/v1/sites/${siteId}`,
  });
}

export async function uploadAndPublishSite(
  settings: AppSettings,
  params: UploadAndPublishSiteParams,
) {
  if (params.files.length === 0) {
    throw new Error("No files selected");
  }

  const manifest = buildFolderUploadManifest(params.files);
  const formData = new FormData();
  formData.append("bucket", params.bucket);
  if (params.parentPrefix.trim() !== "") {
    formData.append("parent_prefix", params.parentPrefix);
  }
  formData.append("domains", JSON.stringify(params.domains));
  formData.append("enabled", String(params.enabled));
  formData.append("index_document", params.indexDocument);
  formData.append("error_document", params.errorDocument);
  formData.append("spa_fallback", String(params.spaFallback));
  formData.append("manifest", JSON.stringify(manifest));
  manifest.forEach((item, index) => {
    formData.append(
      item.file_field,
      params.files[index],
      params.files[index].name,
    );
  });

  try {
    const response = await createApiClient(settings).request({
      method: "POST",
      url: "/api/v1/sites/publish",
      timeout: 0,
      data: formData,
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!params.onProgress || !event.total) {
          return;
        }
        params.onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });

    return response.data.data as PublishSiteResult;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Site publish failed");
  }
}

export function publishObjectSite(
  settings: AppSettings,
  params: PublishObjectSiteParams,
) {
  return apiRequest<Site>(settings, {
    method: "POST",
    url: "/api/v1/sites/publish/object",
    data: {
      bucket: params.bucket,
      object_key: params.objectKey,
      domains: params.domains,
      enabled: params.enabled,
      error_document: params.errorDocument,
      spa_fallback: params.spaFallback,
    },
  });
}
