import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { BucketsPage } from "./BucketsPage";
import { renderWithApp } from "../test/test-utils";

vi.mock("../api/buckets", () => ({
  listBuckets: vi.fn(),
  createBucket: vi.fn(),
}));

import { createBucket, listBuckets } from "../api/buckets";

describe("BucketsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders bucket list and supports creation", async () => {
    vi.mocked(listBuckets)
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            name: "alpha",
            created_at: "2026-03-25T00:00:00Z",
            updated_at: "2026-03-25T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            name: "alpha",
            created_at: "2026-03-25T00:00:00Z",
            updated_at: "2026-03-25T00:00:00Z",
          },
          {
            id: 2,
            name: "beta",
            created_at: "2026-03-25T00:01:00Z",
            updated_at: "2026-03-25T00:01:00Z",
          },
        ],
      });
    vi.mocked(createBucket).mockResolvedValue({
      id: 2,
      name: "beta",
      created_at: "2026-03-25T00:01:00Z",
      updated_at: "2026-03-25T00:01:00Z",
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets" element={<BucketsPage />} />
      </Routes>,
      { route: "/buckets" },
    );

    expect(await screen.findByText("alpha")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Bucket Name"), "beta");
    await userEvent.click(
      screen.getByRole("button", { name: "Create Bucket" }),
    );

    await waitFor(() => {
      expect(createBucket).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "beta",
      );
    });

    expect(await screen.findByText("beta")).toBeInTheDocument();
  });
});
