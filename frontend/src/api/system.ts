import { apiEnvelopeRequest } from "./client";
import type { SystemStatsResult, SystemStorageStats } from "./types";
import type { AppSettings } from "../lib/settings";

export async function getSystemStats(settings: AppSettings) {
  const envelope = await apiEnvelopeRequest<SystemStatsResult>(settings, {
    method: "GET",
    url: "/api/v1/system/stats",
  });

  return envelope.data;
}

export async function updateStorageQuota(
  settings: AppSettings,
  maxBytes: number,
) {
  const envelope = await apiEnvelopeRequest<SystemStorageStats>(settings, {
    method: "PUT",
    url: "/api/v1/system/storage/quota",
    data: {
      max_bytes: maxBytes,
    },
  });

  return envelope.data;
}
