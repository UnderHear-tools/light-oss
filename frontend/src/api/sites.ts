import { apiRequest } from "./client";
import type {
  CreateSiteRequest,
  Site,
  SiteListResult,
  UpdateSiteRequest,
} from "./types";
import type { AppSettings } from "../lib/settings";

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
