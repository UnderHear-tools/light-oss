import axios from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import type { ApiEnvelope } from "./types";
import type { AppSettings } from "../lib/settings";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function createApiClient(settings: AppSettings) {
  const client = axios.create({
    baseURL: normalizeBaseUrl(settings.apiBaseUrl),
    timeout: 15000,
  });

  client.interceptors.request.use((request) => {
    request.headers = request.headers ?? {};

    if (settings.bearerToken.trim() !== "") {
      request.headers.Authorization = `Bearer ${settings.bearerToken.trim()}`;
    }

    if (
      !request.headers["X-Request-ID"] &&
      typeof crypto !== "undefined" &&
      "randomUUID" in crypto
    ) {
      request.headers["X-Request-ID"] = crypto.randomUUID();
    }

    return request;
  });

  return client;
}

export async function apiRequest<T>(
  settings: AppSettings,
  request: AxiosRequestConfig,
): Promise<T> {
  try {
    const response =
      await createApiClient(settings).request<ApiEnvelope<T>>(request);
    return unwrapEnvelope(response);
  } catch (error) {
    throw normalizeApiError(error);
  }
}

function unwrapEnvelope<T>(response: AxiosResponse<ApiEnvelope<T>>): T {
  return response.data.data;
}

function normalizeApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 500;
    const payload = error.response?.data as ApiEnvelope<never> | undefined;
    return new ApiError(
      payload?.error?.message ?? error.message,
      status,
      payload?.error?.code,
    );
  }

  if (error instanceof Error) {
    return new ApiError(error.message, 500);
  }

  return new ApiError("Unknown error", 500);
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}
