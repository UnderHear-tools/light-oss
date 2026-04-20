import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { renderWithApp } from "../test/test-utils";
import { getHealthStatus } from "../api/health";
import { getSystemStats, updateStorageQuota } from "../api/system";

vi.mock("../api/health", () => ({
  getHealthStatus: vi.fn(),
}));

vi.mock("../api/system", () => ({
  getSystemStats: vi.fn(),
  updateStorageQuota: vi.fn(),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.clearAllMocks();
    vi.mocked(getHealthStatus).mockResolvedValue({
      status: {
        service: "ok",
        db: "ok",
      },
      version: "mvp",
    });
    vi.mocked(getSystemStats).mockResolvedValue({
      os: "linux",
      cpu: {
        used_percent: 20,
      },
      memory: {
        total_bytes: 1024,
        used_bytes: 512,
        available_bytes: 512,
        used_percent: 50,
      },
      disks: [],
      storage: {
        root_path: "/data/storage",
        used_bytes: 2 * 1024 * 1024 * 1024,
        max_bytes: 10 * 1024 * 1024 * 1024,
        remaining_bytes: 8 * 1024 * 1024 * 1024,
        used_percent: 20,
        limit_status: "ok",
      },
    });
    vi.mocked(updateStorageQuota).mockResolvedValue({
      root_path: "/data/storage",
      used_bytes: 2 * 1024 * 1024 * 1024,
      max_bytes: 10 * 1024 * 1024 * 1024,
      remaining_bytes: 8 * 1024 * 1024 * 1024,
      used_percent: 20,
      limit_status: "ok",
    });
  });

  it("switches locale and theme with persistence", async () => {
    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      {
        route: "/settings",
        preferences: {
          locale: "en-US",
          theme: "light",
        },
      },
    );

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Change language" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "简体中文" }),
    );

    expect(
      await screen.findByRole("heading", { name: "设置" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "切换主题" }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(window.localStorage.getItem("light-oss-preferences")).toContain(
        '"locale":"zh-CN"',
      );
      expect(window.localStorage.getItem("light-oss-preferences")).toContain(
        '"theme":"dark"',
      );
    });
  });

  it("renders connection settings before preferences and keeps security notice inside the connection card", async () => {
    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    const connectionTitle = screen.getByText("Connection settings");
    const storageTitle = screen.getByText("Storage limit");
    const preferencesTitle = screen.getByText("Interface preferences");
    const connectionCard = connectionTitle.closest("[data-slot='card']");
    const storageCard = storageTitle.closest("[data-slot='card']");
    const preferencesCard = preferencesTitle.closest("[data-slot='card']");

    expect(connectionCard).not.toBeNull();
    expect(storageCard).not.toBeNull();
    expect(preferencesCard).not.toBeNull();
    expect(await screen.findByText("Database OK")).toBeInTheDocument();
    expect(
      connectionTitle.compareDocumentPosition(preferencesTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      within(connectionCard as HTMLElement).getByText("Security notice"),
    ).toBeInTheDocument();
    expect(
      within(preferencesCard as HTMLElement).queryByText("Security notice"),
    ).not.toBeInTheDocument();
  });

  it("renders a test connection button to the left of save", async () => {
    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    const testButton = screen.getByRole("button", { name: "Test connection" });
    const saveButton = screen.getByRole("button", { name: "Save changes" });

    expect(
      testButton.compareDocumentPosition(saveButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("toggles bearer token visibility without changing the saved value", async () => {
    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    const tokenInput = screen.getByLabelText("Bearer token");

    expect(tokenInput).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(tokenInput).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(tokenInput).toHaveAttribute("type", "password");
    expect(window.localStorage.getItem("light-oss-settings")).toContain(
      '"bearerToken":"dev-token"',
    );
  });

  it("saves connection settings to localStorage and refreshes health status", async () => {
    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    expect(await screen.findByText("Service OK")).toBeInTheDocument();
    expect(getHealthStatus).toHaveBeenCalledWith({
      apiBaseUrl: "http://localhost:8080",
      bearerToken: "dev-token",
    });

    const apiInput = screen.getByLabelText("API base URL");
    const tokenInput = screen.getByLabelText("Bearer token");

    await userEvent.clear(apiInput);
    await userEvent.type(apiInput, "http://localhost:9090");
    await userEvent.clear(tokenInput);
    await userEvent.type(tokenInput, "next-token");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("light-oss-settings")).toContain(
        '"apiBaseUrl":"http://localhost:9090"',
      );
      expect(window.localStorage.getItem("light-oss-settings")).toContain(
        '"bearerToken":"next-token"',
      );
      expect(getHealthStatus).toHaveBeenLastCalledWith({
        apiBaseUrl: "http://localhost:9090",
        bearerToken: "next-token",
      });
    });
  });

  it("renders persisted storage quota controls", async () => {
    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    expect(await screen.findByText("Storage limit")).toBeInTheDocument();
    expect(await screen.findByText("Current usage")).toBeInTheDocument();
    expect(await screen.findByText("2.0 GB")).toBeInTheDocument();
    expect(await screen.findByLabelText("Storage limit (GiB)")).toHaveValue(10);
  });

  it("updates the persisted storage quota without changing local settings", async () => {
    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    const input = await screen.findByLabelText("Storage limit (GiB)");
    await userEvent.clear(input);
    await userEvent.type(input, "12.5");
    await userEvent.click(
      screen.getByRole("button", { name: "Save storage limit" }),
    );

    await waitFor(() => {
      expect(updateStorageQuota).toHaveBeenCalledWith(
        {
          apiBaseUrl: "http://localhost:8080",
          bearerToken: "dev-token",
        },
        13421772800,
      );
    });

    expect(
      JSON.parse(window.localStorage.getItem("light-oss-settings") ?? "{}"),
    ).toEqual({
      apiBaseUrl: "http://localhost:8080",
      bearerToken: "dev-token",
    });
  });

  it("shows backend quota update errors", async () => {
    vi.mocked(updateStorageQuota).mockRejectedValueOnce(
      Object.assign(
        new Error("storage limit cannot be lower than current usage"),
        {
          status: 409,
          code: "storage_limit_below_usage",
        },
      ),
    );

    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    await screen.findByText("Storage limit");
    await userEvent.click(
      screen.getByRole("button", { name: "Save storage limit" }),
    );

    expect(
      await screen.findByText(
        "storage limit cannot be lower than current usage",
      ),
    ).toBeInTheDocument();
  });

  it("tests the current draft connection without saving settings", async () => {
    vi.mocked(getHealthStatus)
      .mockResolvedValueOnce({
        status: {
          service: "ok",
          db: "ok",
        },
        version: "mvp",
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("missing or invalid bearer token"), {
          status: 401,
          code: "unauthorized",
        }),
      );

    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    const apiInput = screen.getByLabelText("API base URL");
    const tokenInput = screen.getByLabelText("Bearer token");

    await userEvent.clear(apiInput);
    await userEvent.type(apiInput, "http://localhost:9090");
    await userEvent.clear(tokenInput);
    await userEvent.type(tokenInput, "invalid-token");
    await userEvent.click(
      screen.getByRole("button", { name: "Test connection" }),
    );

    await waitFor(() => {
      expect(getHealthStatus).toHaveBeenLastCalledWith({
        apiBaseUrl: "http://localhost:9090",
        bearerToken: "invalid-token",
      });
    });

    expect(await screen.findByText("Service Token error")).toBeInTheDocument();
    expect(screen.getByText("Database Token error")).toBeInTheDocument();
    expect(window.localStorage.getItem("light-oss-settings")).toContain(
      '"apiBaseUrl":"http://localhost:8080"',
    );
  });

  it("shows unconfigured health status without sending a request", async () => {
    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      {
        route: "/settings",
        settings: {
          apiBaseUrl: "",
          bearerToken: "",
        },
      },
    );

    expect(await screen.findByText("Service Unconfigured")).toBeInTheDocument();
    expect(screen.getByText("Database Unconfigured")).toBeInTheDocument();
    expect(getHealthStatus).not.toHaveBeenCalled();
    expect(getSystemStats).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Test connection" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Save the connection settings with a valid bearer token before changing the storage limit.",
      ),
    ).toBeInTheDocument();
  });

  it("shows token error health state when saved token is invalid", async () => {
    vi.mocked(getHealthStatus).mockRejectedValueOnce(
      Object.assign(new Error("missing or invalid bearer token"), {
        status: 401,
        code: "unauthorized",
      }),
    );

    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    expect(await screen.findByText("Service Token error")).toBeInTheDocument();
    expect(screen.getByText("Database Token error")).toBeInTheDocument();
  });

  it("clears manual test status after the draft changes", async () => {
    vi.mocked(getHealthStatus)
      .mockResolvedValueOnce({
        status: {
          service: "ok",
          db: "ok",
        },
        version: "mvp",
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("missing or invalid bearer token"), {
          status: 401,
          code: "unauthorized",
        }),
      );

    renderWithApp(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: "/settings" },
    );

    const apiInput = screen.getByLabelText("API base URL");
    const tokenInput = screen.getByLabelText("Bearer token");

    await userEvent.clear(apiInput);
    await userEvent.type(apiInput, "http://localhost:9090");
    await userEvent.clear(tokenInput);
    await userEvent.type(tokenInput, "invalid-token");
    await userEvent.click(
      screen.getByRole("button", { name: "Test connection" }),
    );

    expect(await screen.findByText("Service Token error")).toBeInTheDocument();

    await userEvent.type(tokenInput, "x");

    await waitFor(() => {
      expect(screen.getByText("Service OK")).toBeInTheDocument();
      expect(screen.getByText("Database OK")).toBeInTheDocument();
    });
  });
});
