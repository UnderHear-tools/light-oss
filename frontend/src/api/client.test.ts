import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiEnvelopeRequest, apiRequest } from "./client";
import type { AppSettings } from "../lib/settings";

const { create, request } = vi.hoisted(() => {
  const request = vi.fn();
  const create = vi.fn(() => ({
    request,
    interceptors: {
      request: {
        use: vi.fn(),
      },
    },
  }));

  return { create, request };
});

vi.mock("axios", () => ({
  default: {
    create,
    isAxiosError: vi.fn(() => false),
  },
}));

const settings: AppSettings = {
  apiBaseUrl: "http://localhost:8080",
  bearerToken: "dev-token",
};

describe("api client helpers", () => {
  beforeEach(() => {
    request.mockReset();
    create.mockClear();
  });

  it("unwraps data envelopes for regular JSON responses", async () => {
    request.mockResolvedValueOnce({
      status: 200,
      data: {
        request_id: "req_1",
        data: {
          id: 1,
          name: "alpha",
        },
      },
    });

    await expect(
      apiRequest<{ id: number; name: string }>(settings, {
        method: "GET",
        url: "/api/v1/buckets",
      }),
    ).resolves.toEqual({
      id: 1,
      name: "alpha",
    });
  });

  it("treats 204 responses as empty success values", async () => {
    request.mockResolvedValueOnce({
      status: 204,
      data: "",
    });

    await expect(
      apiRequest<void>(settings, {
        method: "DELETE",
        url: "/api/v1/buckets/demo",
      }),
    ).resolves.toBeUndefined();
  });

  it("returns an empty envelope shape for 204 responses", async () => {
    request.mockResolvedValueOnce({
      status: 204,
      data: "",
    });

    await expect(
      apiEnvelopeRequest<void>(settings, {
        method: "DELETE",
        url: "/api/v1/sites/1",
      }),
    ).resolves.toEqual({
      request_id: "",
      data: undefined,
    });
  });
});
