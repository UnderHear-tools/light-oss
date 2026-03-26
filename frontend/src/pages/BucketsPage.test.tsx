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

  it("renders the create card, opens the dialog, and refreshes the grid", async () => {
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

    expect(
      await screen.findByRole("heading", { name: "bucket" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "alpha" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new bucket" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Create a new bucket" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Create a new bucket" }),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("bucket name"), "beta");
    await userEvent.click(
      screen.getByRole("button", { name: "Create bucket" }),
    );

    await waitFor(() => {
      expect(createBucket).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "beta",
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(await screen.findByRole("link", { name: "beta" })).toBeInTheDocument();
  });

  it("shows only the create card when the list is empty", async () => {
    vi.mocked(listBuckets).mockResolvedValueOnce({ items: [] });

    renderWithApp(
      <Routes>
        <Route path="/buckets" element={<BucketsPage />} />
      </Routes>,
      { route: "/buckets" },
    );

    expect(
      await screen.findByRole("button", { name: "Create a new bucket" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No buckets yet")).not.toBeInTheDocument();
    expect(screen.getByText("0 total")).toBeInTheDocument();
  });
});
