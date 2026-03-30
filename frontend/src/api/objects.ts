import { ApiError, apiRequest, createApiClient } from "./client";
import type { AxiosProgressEvent } from "axios";
import type { AppSettings } from "../lib/settings";
import type {
  BatchUploadResult,
  ExplorerEntriesResult,
  ObjectItem,
  ObjectListResult,
  ObjectVisibility,
  SignedDownloadResult,
} from "./types";

export interface ListObjectsParams {
  bucket: string;
  prefix: string;
  limit: number;
  cursor: string;
}

export interface UploadObjectParams {
  bucket: string;
  objectKey: string;
  file: File;
  visibility: ObjectVisibility;
  onProgress?: (value: number) => void;
}

export interface UploadFolderParams {
  bucket: string;
  prefix: string;
  files: File[];
  visibility: ObjectVisibility;
  onProgress?: (value: number) => void;
}

export interface ListExplorerEntriesParams {
  bucket: string;
  prefix: string;
  search: string;
  limit: number;
  cursor: string;
}

export interface CreateFolderParams {
  bucket: string;
  prefix: string;
  name: string;
}

export interface DeleteFolderOptions {
  recursive?: boolean;
}

export interface UpdateObjectVisibilityParams {
  bucket: string;
  objectKey: string;
  visibility: ObjectVisibility;
}

interface UploadFolderManifestItem {
  file_field: string;
  relative_path: string;
}

export function listObjects(settings: AppSettings, params: ListObjectsParams) {
  return apiRequest<ObjectListResult>(settings, {
    method: "GET",
    url: `/api/v1/buckets/${encodeURIComponent(params.bucket)}/objects`,
    params: {
      prefix: params.prefix || undefined,
      limit: params.limit,
      cursor: params.cursor || undefined,
    },
  });
}

export function listExplorerEntries(
  settings: AppSettings,
  params: ListExplorerEntriesParams,
) {
  return apiRequest<ExplorerEntriesResult>(settings, {
    method: "GET",
    url: `/api/v1/buckets/${encodeURIComponent(params.bucket)}/entries`,
    params: {
      prefix: params.prefix || undefined,
      search: params.search || undefined,
      limit: params.limit,
      cursor: params.cursor || undefined,
    },
  });
}

export function createFolder(
  settings: AppSettings,
  params: CreateFolderParams,
) {
  return apiRequest(settings, {
    method: "POST",
    url: `/api/v1/buckets/${encodeURIComponent(params.bucket)}/folders`,
    data: {
      prefix: params.prefix,
      name: params.name,
    },
  });
}

export function deleteFolder(
  settings: AppSettings,
  bucket: string,
  folderPath: string,
  options?: DeleteFolderOptions,
) {
  return apiRequest<void>(settings, {
    method: "DELETE",
    url: `/api/v1/buckets/${encodeURIComponent(bucket)}/folders`,
    params: {
      path: folderPath,
      recursive: options?.recursive ? true : undefined,
    },
  });
}

export async function uploadObject(
  settings: AppSettings,
  params: UploadObjectParams,
) {
  try {
    const response = await createApiClient(settings).request({
      method: "PUT",
      url: `/api/v1/buckets/${encodeURIComponent(params.bucket)}/objects/${encodeObjectKey(
        params.objectKey,
      )}`,
      timeout: 0,
      data: params.file,
      headers: {
        "Content-Type": params.file.type || "application/octet-stream",
        "X-Object-Visibility": params.visibility,
        "X-Original-Filename": encodeHeaderFilename(params.file.name),
      },
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!params.onProgress || !event.total) {
          return;
        }
        params.onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });

    return response.data.data as ObjectItem;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Upload failed");
  }
}

export async function uploadFolder(
  settings: AppSettings,
  params: UploadFolderParams,
) {
  if (params.files.length === 0) {
    throw new Error("No files selected");
  }

  const formData = new FormData();
  if (params.prefix.trim() !== "") {
    formData.append("prefix", params.prefix);
  }
  formData.append("visibility", params.visibility);

  const manifest: UploadFolderManifestItem[] = [];
  params.files.forEach((file, index) => {
    const fileField = `file_${index}`;
    manifest.push({
      file_field: fileField,
      relative_path: getFolderRelativePath(file),
    });
    formData.append(fileField, file, file.name);
  });
  formData.append("manifest", JSON.stringify(manifest));

  try {
    const response = await createApiClient(settings).request({
      method: "POST",
      url: `/api/v1/buckets/${encodeURIComponent(params.bucket)}/objects/batch`,
      timeout: 0,
      data: formData,
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!params.onProgress || !event.total) {
          return;
        }
        params.onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });

    return response.data.data as BatchUploadResult;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Upload failed");
  }
}

export function deleteObject(
  settings: AppSettings,
  bucket: string,
  objectKey: string,
) {
  return apiRequest<void>(settings, {
    method: "DELETE",
    url: `/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeObjectKey(objectKey)}`,
  });
}

export function updateObjectVisibility(
  settings: AppSettings,
  params: UpdateObjectVisibilityParams,
) {
  return apiRequest<ObjectItem>(settings, {
    method: "PATCH",
    url: `/api/v1/buckets/${encodeURIComponent(params.bucket)}/objects/visibility/${encodeObjectKey(
      params.objectKey,
    )}`,
    data: {
      visibility: params.visibility,
    },
  });
}

export function createSignedDownloadURL(
  settings: AppSettings,
  bucket: string,
  objectKey: string,
  expiresInSeconds: number,
) {
  return apiRequest<SignedDownloadResult>(settings, {
    method: "POST",
    url: "/api/v1/sign/download",
    data: {
      bucket,
      object_key: objectKey,
      expires_in_seconds: expiresInSeconds,
    },
  });
}

export function buildPublicObjectURL(
  apiBaseUrl: string,
  bucket: string,
  objectKey: string,
) {
  const baseUrl = apiBaseUrl.trim().replace(/\/+$/, "");
  return `${baseUrl}/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeObjectKey(
    objectKey,
  )}`;
}

function encodeObjectKey(objectKey: string) {
  return objectKey.split("/").map(encodeObjectKeySegment).join("/");
}

function encodeHeaderFilename(filename: string) {
  return encodeURIComponent(filename);
}

function getFolderRelativePath(file: File) {
  const relativePath =
    "webkitRelativePath" in file && typeof file.webkitRelativePath === "string"
      ? file.webkitRelativePath
      : "";
  const normalizedPath = relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();

  if (!normalizedPath) {
    throw new Error("Folder upload requires relative paths");
  }

  return normalizedPath;
}

function encodeObjectKeySegment(segment: string) {
  // Keep dots percent-encoded so upstream proxies do not treat object keys as file extensions.
  return encodeURIComponent(segment).replace(/\./g, "%2E");
}
