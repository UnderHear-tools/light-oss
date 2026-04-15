import { apiEnvelopeRequest } from "./client";
import type { SystemStatsResult } from "./types";
import type { AppSettings } from "../lib/settings";

export async function getSystemStats(settings: AppSettings) {
  const envelope = await apiEnvelopeRequest<SystemStatsResult>(settings, {
    method: "GET",
    url: "/api/v1/system/stats",
  });

  return envelope.data;
}
