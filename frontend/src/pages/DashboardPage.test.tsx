import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import { renderWithApp } from "../test/test-utils";

vi.mock("../api/buckets", () => ({
  listBuckets: vi.fn(),
}));

vi.mock("../api/system", () => ({
  getSystemStats: vi.fn(),
}));

import { listBuckets } from "../api/buckets";
import { getSystemStats } from "../api/system";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders bucket overview and system metrics", async () => {
    vi.mocked(listBuckets).mockResolvedValueOnce({
      items: [
        {
          id: 1,
          name: "alpha",
          created_at: "2026-03-25T00:00:00Z",
          updated_at: "2026-03-25T00:00:00Z",
        },
      ],
    });
    vi.mocked(getSystemStats).mockResolvedValueOnce({
      os: "linux",
      cpu: {
        used_percent: 27.3,
      },
      memory: {
        total_bytes: 8 * 1024 * 1024 * 1024,
        used_bytes: 4 * 1024 * 1024 * 1024,
        available_bytes: 4 * 1024 * 1024 * 1024,
        used_percent: 50,
      },
      disks: [
        {
          label: "C:",
          mount_point: "C:\\",
          filesystem: "NTFS",
          total_bytes: 100 * 1024 * 1024 * 1024,
          used_bytes: 40 * 1024 * 1024 * 1024,
          free_bytes: 60 * 1024 * 1024 * 1024,
          used_percent: 40,
          contains_storage_root: true,
        },
        {
          label: "D:",
          mount_point: "D:\\",
          filesystem: "NTFS",
          total_bytes: 200 * 1024 * 1024 * 1024,
          used_bytes: 50 * 1024 * 1024 * 1024,
          free_bytes: 150 * 1024 * 1024 * 1024,
          used_percent: 25,
          contains_storage_root: false,
        },
      ],
      storage: {
        root_path: "C:\\light-oss-data\\storage",
        used_bytes: 512 * 1024 * 1024,
        max_bytes: 10 * 1024 * 1024 * 1024,
        remaining_bytes: 9.5 * 1024 * 1024 * 1024,
        used_percent: 5,
        limit_status: "ok",
      },
    });

    renderWithApp(
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>,
      { route: "/dashboard" },
    );

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total bucket")).toBeInTheDocument();
    expect(screen.getByText("API host overview")).toBeInTheDocument();
    expect(screen.getByText("Host OS")).toBeInTheDocument();
    expect(await screen.findByText("Linux")).toBeInTheDocument();
    expect(screen.getByText("CPU usage")).toBeInTheDocument();
    expect(await screen.findByText("27.3%")).toBeInTheDocument();
    expect(screen.getByText("Memory usage")).toBeInTheDocument();
    expect(await screen.findByText("50.0%")).toBeInTheDocument();
    expect(screen.getAllByText("OSS storage used").length).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText("512.0 MB / 10.0 GB")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Disk usage")).toBeInTheDocument();
    expect(await screen.findByText("C:")).toBeInTheDocument();
    expect(screen.getAllByText("Storage root").length).toBeGreaterThan(0);
    expect(screen.queryByText("Storage limit warning")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create bucket" }),
    ).not.toBeInTheDocument();
  });

  it("shows system stats error without hiding bucket overview", async () => {
    vi.mocked(listBuckets).mockResolvedValueOnce({
      items: [
        {
          id: 1,
          name: "alpha",
          created_at: "2026-03-25T00:00:00Z",
          updated_at: "2026-03-25T00:00:00Z",
        },
      ],
    });
    vi.mocked(getSystemStats).mockRejectedValueOnce(
      Object.assign(new Error("system metrics unavailable"), {
        status: 500,
        code: "system_metrics_unavailable",
      }),
    );

    renderWithApp(
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>,
      { route: "/dashboard" },
    );

    expect(
      await screen.findByText("Failed to load system stats"),
    ).toBeInTheDocument();
    expect(screen.getByText("system metrics unavailable")).toBeInTheDocument();
    expect(screen.getByText("Total bucket")).toBeInTheDocument();
    expect(screen.getByText("API host overview")).toBeInTheDocument();
  });

  it("shows a warning alert when storage usage reaches the warning threshold", async () => {
    vi.mocked(listBuckets).mockResolvedValueOnce({ items: [] });
    vi.mocked(getSystemStats).mockResolvedValueOnce({
      os: "linux",
      cpu: {
        used_percent: 27.3,
      },
      memory: {
        total_bytes: 8 * 1024 * 1024 * 1024,
        used_bytes: 4 * 1024 * 1024 * 1024,
        available_bytes: 4 * 1024 * 1024 * 1024,
        used_percent: 50,
      },
      disks: [],
      storage: {
        root_path: "/data/storage",
        used_bytes: 8 * 1024 * 1024 * 1024,
        max_bytes: 10 * 1024 * 1024 * 1024,
        remaining_bytes: 2 * 1024 * 1024 * 1024,
        used_percent: 80,
        limit_status: "warning",
      },
    });

    renderWithApp(
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>,
      { route: "/dashboard" },
    );

    expect(
      await screen.findByText("Storage limit warning"),
    ).toBeInTheDocument();
  });

  it("shows a destructive alert when storage usage exceeds the limit", async () => {
    vi.mocked(listBuckets).mockResolvedValueOnce({ items: [] });
    vi.mocked(getSystemStats).mockResolvedValueOnce({
      os: "linux",
      cpu: {
        used_percent: 27.3,
      },
      memory: {
        total_bytes: 8 * 1024 * 1024 * 1024,
        used_bytes: 4 * 1024 * 1024 * 1024,
        available_bytes: 4 * 1024 * 1024 * 1024,
        used_percent: 50,
      },
      disks: [],
      storage: {
        root_path: "/data/storage",
        used_bytes: 12 * 1024 * 1024 * 1024,
        max_bytes: 10 * 1024 * 1024 * 1024,
        remaining_bytes: 0,
        used_percent: 120,
        limit_status: "exceeded",
      },
    });

    renderWithApp(
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>,
      { route: "/dashboard" },
    );

    expect(
      await screen.findByText("Storage limit exceeded"),
    ).toBeInTheDocument();
  });
});
