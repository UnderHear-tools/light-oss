import { ApiError, apiRequest, createApiClient } from "./client";
import type { AxiosProgressEvent } from "axios";
import type { AppSettings } from "../lib/settings";
import type {
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
      data: params.file,
      headers: {
        "Content-Type": params.file.type || "application/octet-stream",
        "X-Object-Visibility": params.visibility,
        "X-Original-Filename": params.file.name,
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
  return objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
