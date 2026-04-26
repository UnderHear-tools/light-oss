import { screen, waitFor } from "@testing-library/react";
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
    window.localStorage.clear();
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
    expect(screen.getByRole("link", { name: "Site management" })).toBeInTheDocument();
    expect(screen.getAllByText("Dashboard")[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Toggle Sidebar" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Dashboard body")).toBeInTheDocument();
    expect(await screen.findByText("Service OK")).toBeInTheDocument();
    expect(screen.getByText("Database OK")).toBeInTheDocument();
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
    expect(screen.getByText("Database Unknown")).toBeInTheDocument();
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
    expect(screen.getByText("Database Token error")).toBeInTheDocument();
  });

  it("shows the site management breadcrumb and active navigation on /sites", async () => {
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
          <Route path="/sites" element={<div>Sites body</div>} />
        </Route>
      </Routes>,
      { route: "/sites" },
    );

    const siteLink = screen
      .getAllByRole("link", { name: "Site management" })
      .find((element) => element.getAttribute("href") === "/sites");

    expect(siteLink).toBeInTheDocument();
    expect(siteLink?.closest("[data-active='true']")).not.toBeNull();
    expect(screen.getAllByText("Site management")[0]).toBeInTheDocument();
    expect(screen.getByText("Sites body")).toBeInTheDocument();
    expect(await screen.findByText("Service OK")).toBeInTheDocument();
  });

  it("ignores a non-bucket cached sidebar bucket route", async () => {
    vi.mocked(getHealthStatus).mockResolvedValueOnce({
      status: {
        service: "ok",
        db: "ok",
      },
      version: "mvp",
    });
    window.localStorage.setItem("light-oss-last-bucket-route", "/dashboard");

    renderWithApp(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>Dashboard body</div>} />
        </Route>
      </Routes>,
      { route: "/dashboard" },
    );

    expect(screen.getByRole("link", { name: "bucket" })).toHaveAttribute("href", "/buckets");
  });

  it("keeps a valid cached sidebar bucket route", async () => {
    vi.mocked(getHealthStatus).mockResolvedValueOnce({
      status: {
        service: "ok",
        db: "ok",
      },
      version: "mvp",
    });
    window.localStorage.setItem(
      "light-oss-last-bucket-route",
      "/buckets/media?prefix=avatars",
    );

    renderWithApp(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>Dashboard body</div>} />
        </Route>
      </Routes>,
      { route: "/dashboard" },
    );

    expect(screen.getByRole("link", { name: "bucket" })).toHaveAttribute(
      "href",
      "/buckets/media?prefix=avatars",
    );
  });

  it("stores the bucket list route over a cached bucket detail route", async () => {
    vi.mocked(getHealthStatus).mockResolvedValueOnce({
      status: {
        service: "ok",
        db: "ok",
      },
      version: "mvp",
    });
    window.localStorage.setItem(
      "light-oss-last-bucket-route",
      "/buckets/media?prefix=avatars",
    );

    renderWithApp(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/buckets" element={<div>Buckets body</div>} />
        </Route>
      </Routes>,
      { route: "/buckets" },
    );

    const bucketLink = screen
      .getAllByRole("link", { name: "bucket" })
      .find((element) => element.getAttribute("href") === "/buckets");

    expect(bucketLink).toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem("light-oss-last-bucket-route")).toBe("/buckets");
    });
  });

  it("uses a viewport-height shell so route overflow stays inside the layout scroll area", async () => {
    vi.mocked(getHealthStatus).mockResolvedValueOnce({
      status: {
        service: "ok",
        db: "ok",
      },
      version: "mvp",
    });

    const { container } = renderWithApp(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>Dashboard body</div>} />
        </Route>
      </Routes>,
      { route: "/dashboard" },
    );

    const sidebarInset = container.querySelector("[data-slot='sidebar-inset']");
    const outletScrollArea = container.querySelector(
      "[data-slot='sidebar-inset'] > main > div",
    );

    expect(sidebarInset?.className).toContain("h-svh");
    expect(sidebarInset?.className).not.toContain("min-h-svh");
    expect(outletScrollArea?.className).toContain("overflow-auto");
  });
});
