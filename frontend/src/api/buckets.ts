import { apiRequest } from "./client";
import type { Bucket, BucketListResult } from "./types";
import type { AppSettings } from "../lib/settings";

export function listBuckets(settings: AppSettings) {
  return apiRequest<BucketListResult>(settings, {
    method: "GET",
    url: "/api/v1/buckets",
  });
}

export function createBucket(settings: AppSettings, name: string) {
  return apiRequest<Bucket>(settings, {
    method: "POST",
    url: "/api/v1/buckets",
    data: { name },
  });
}

export function deleteBucket(settings: AppSettings, bucketName: string) {
  return apiRequest<void>(settings, {
    method: "DELETE",
    url: `/api/v1/buckets/${encodeURIComponent(bucketName)}`,
  });
}
