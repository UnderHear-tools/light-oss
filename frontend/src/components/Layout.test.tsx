import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { Layout } from "./Layout";
import { renderWithApp } from "../test/test-utils";
import { getHealthStatus } from "../api/health";

vi.mock("../api/health", () => ({
  getHealthStatus: vi.fn(),
}));

describe("Layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sidebar shell, breadcrumb header, and healthy connection state", async () => {
    vi.mocked(getHealthStatus).mockResolvedValueOnce({
      status: {
        service: "ok",
        db: "ok",
      },
      version: "mvp",
    });

    renderWithApp(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>Dashboard body</div>} />
        </Route>
      </Routes>,
      { route: "/dashboard" },
    );

    expect(screen.getAllByText("Light OSS Dashboard")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "bucket" })).toBeInTheDocument();
    expect(screen.getAllByText("Dashboard")[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Toggle Sidebar" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Dashboard body")).toBeInTheDocument();
    expect(await screen.findByText("Service OK")).toBeInTheDocument();
    expect(screen.getByText("DB OK")).toBeInTheDocument();
  });

  it("shows unreachable sidebar health state when the request fails", async () => {
    vi.mocked(getHealthStatus).mockRejectedValueOnce(new Error("Network Error"));

    renderWithApp(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>Dashboard body</div>} />
        </Route>
      </Routes>,
      { route: "/dashboard" },
    );

    expect(await screen.findByText("Service Unreachable")).toBeInTheDocument();
    expect(screen.getByText("DB Unknown")).toBeInTheDocument();
  });

  it("shows token error sidebar health state when the request is unauthorized", async () => {
    vi.mocked(getHealthStatus).mockRejectedValueOnce(
      Object.assign(new Error("missing or invalid bearer token"), {
        status: 401,
        code: "unauthorized",
      }),
    );

    renderWithApp(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>Dashboard body</div>} />
        </Route>
      </Routes>,
      { route: "/dashboard" },
    );

    expect(await screen.findByText("Service Token error")).toBeInTheDocument();
    expect(screen.getByText("DB Token error")).toBeInTheDocument();
  });
});
