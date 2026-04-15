import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../lib/settings";
import { getSystemStats } from "./system";

const apiEnvelopeRequestMock = vi.fn();

vi.mock("./client", () => ({
  apiEnvelopeRequest: (...args: unknown[]) => apiEnvelopeRequestMock(...args),
}));

const settings: AppSettings = {
  apiBaseUrl: "http://localhost:8080",
  bearerToken: "dev-token",
};

describe("system api helper", () => {
  beforeEach(() => {
    apiEnvelopeRequestMock.mockReset();
  });

  it("parses successful system stats responses", async () => {
    apiEnvelopeRequestMock.mockResolvedValueOnce({
      request_id: "req_1",
      data: {
        os: "linux",
        cpu: {
          used_percent: 12.5,
        },
        memory: {
          total_bytes: 1024,
          used_bytes: 512,
          available_bytes: 512,
          used_percent: 50,
        },
        disks: [
          {
            label: "/",
            mount_point: "/",
            filesystem: "ext4",
            total_bytes: 2048,
            used_bytes: 1024,
            free_bytes: 1024,
            used_percent: 50,
            contains_storage_root: true,
          },
        ],
        storage: {
          root_path: "/data/storage",
          used_bytes: 512,
        },
      },
    });

    await expect(getSystemStats(settings)).resolves.toEqual({
      os: "linux",
      cpu: {
        used_percent: 12.5,
      },
      memory: {
        total_bytes: 1024,
        used_bytes: 512,
        available_bytes: 512,
        used_percent: 50,
      },
      disks: [
        {
          label: "/",
          mount_point: "/",
          filesystem: "ext4",
          total_bytes: 2048,
          used_bytes: 1024,
          free_bytes: 1024,
          used_percent: 50,
          contains_storage_root: true,
        },
      ],
      storage: {
        root_path: "/data/storage",
        used_bytes: 512,
      },
    });

    expect(apiEnvelopeRequestMock).toHaveBeenCalledWith(
      settings,
      expect.objectContaining({
        method: "GET",
        url: "/api/v1/system/stats",
      }),
    );
  });

  it("rethrows normalized errors", async () => {
    const systemError = Object.assign(new Error("system metrics unavailable"), {
      status: 500,
      code: "system_metrics_unavailable",
    });

    apiEnvelopeRequestMock.mockRejectedValueOnce(systemError);

    await expect(getSystemStats(settings)).rejects.toMatchObject({
      message: "system metrics unavailable",
      status: 500,
      code: "system_metrics_unavailable",
    });
  });
});
