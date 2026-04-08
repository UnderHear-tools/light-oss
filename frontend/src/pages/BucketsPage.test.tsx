import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { BucketsPage } from "./BucketsPage";
import { renderWithApp } from "../test/test-utils";

vi.mock("../api/buckets", () => ({
  listBuckets: vi.fn(),
  createBucket: vi.fn(),
  deleteBucket: vi.fn(),
}));

vi.mock("../api/sites", () => ({
  listSites: vi.fn(),
}));

import { createBucket, deleteBucket, listBuckets } from "../api/buckets";
import { listSites } from "../api/sites";

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
    vi.mocked(listSites).mockResolvedValue({ items: [] });
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
    vi.mocked(listSites).mockResolvedValue({ items: [] });

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

  it("requires typing the bucket name before deleting and shows linked sites", async () => {
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
      .mockResolvedValueOnce({ items: [] });
    vi.mocked(listSites)
      .mockResolvedValueOnce({
        items: [
          {
            id: 9,
            bucket: "alpha",
            root_prefix: "docs/",
            enabled: true,
            index_document: "index.html",
            error_document: "",
            spa_fallback: true,
            domains: ["demo.underhear.cn", "www.underhear.cn"],
            created_at: "2026-03-25T00:00:00Z",
            updated_at: "2026-03-25T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({ items: [] });
    vi.mocked(deleteBucket).mockResolvedValue(undefined);

    renderWithApp(
      <Routes>
        <Route path="/buckets" element={<BucketsPage />} />
      </Routes>,
      { route: "/buckets" },
    );

    const deleteButtons = await screen.findAllByRole("button", {
      name: "Delete",
    });
    await userEvent.click(deleteButtons[0]);

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete bucket?")).toBeInTheDocument();
    expect(within(dialog).getByText("Root prefix: docs/")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Domains: demo.underhear.cn, www.underhear.cn",
      ),
    ).toBeInTheDocument();

    const confirmButton = within(dialog).getByRole("button", {
      name: "Delete bucket",
    });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(
      within(dialog).getByLabelText("Type the bucket name to confirm"),
      "beta",
    );
    expect(confirmButton).toBeDisabled();

    await userEvent.clear(
      within(dialog).getByLabelText("Type the bucket name to confirm"),
    );
    await userEvent.type(
      within(dialog).getByLabelText("Type the bucket name to confirm"),
      "alpha",
    );
    expect(confirmButton).toBeEnabled();

    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteBucket).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "alpha",
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "alpha" })).not.toBeInTheDocument();
    });
  });

  it("disables bucket deletion when the site list fails to load", async () => {
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
    vi.mocked(listSites).mockRejectedValue(new Error("site load failed"));

    renderWithApp(
      <Routes>
        <Route path="/buckets" element={<BucketsPage />} />
      </Routes>,
      { route: "/buckets" },
    );

    expect(await screen.findByText("site load failed")).toBeInTheDocument();
    const deleteButtons = await screen.findAllByRole("button", {
      name: "Delete",
    });
    expect(deleteButtons[0]).toBeDisabled();
  });
});
