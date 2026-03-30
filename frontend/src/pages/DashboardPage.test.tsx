import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import { renderWithApp } from "../test/test-utils";

vi.mock("../api/buckets", () => ({
  listBuckets: vi.fn(),
}));

import { listBuckets } from "../api/buckets";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders overview without bucket creation controls", async () => {
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
    expect(
      screen.queryByRole("button", { name: "Create bucket" }),
    ).not.toBeInTheDocument();
  });
});
