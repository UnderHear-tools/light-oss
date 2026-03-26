import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { BucketObjectsPage } from "./BucketObjectsPage";
import { renderWithApp } from "../test/test-utils";

vi.mock("../api/objects", () => ({
  listExplorerEntries: vi.fn(),
  createFolder: vi.fn(),
  uploadObject: vi.fn(),
  deleteObject: vi.fn(),
  deleteFolder: vi.fn(),
  createSignedDownloadURL: vi.fn(),
  buildPublicObjectURL: vi.fn(() => "http://localhost:8080/download"),
}));

import {
  createFolder,
  deleteObject,
  listExplorerEntries,
  uploadObject,
} from "../api/objects";

describe("BucketObjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates into a directory from the table", async () => {
    vi.mocked(listExplorerEntries)
      .mockResolvedValueOnce({
        items: [
          {
            type: "directory",
            path: "docs/",
            name: "docs",
            is_empty: false,
            object_key: null,
            original_filename: null,
            size: null,
            content_type: null,
            etag: null,
            visibility: null,
            updated_at: null,
          },
        ],
        next_cursor: "",
      })
      .mockResolvedValueOnce({
        items: [
          {
            type: "file",
            path: "docs/readme.txt",
            name: "readme.txt",
            is_empty: null,
            object_key: "docs/readme.txt",
            original_filename: "readme.txt",
            size: 12,
            content_type: "text/plain",
            etag: "abcdef1234567890",
            visibility: "public",
            updated_at: "2026-03-25T00:00:00Z",
          },
        ],
        next_cursor: "",
      });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    const table = await screen.findByRole("table");
    await userEvent.click(within(table).getByRole("button", { name: "docs" }));

    expect(await screen.findByText("readme.txt")).toBeInTheDocument();
    await waitFor(() => {
      expect(listExplorerEntries).toHaveBeenLastCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          prefix: "docs/",
          search: "",
        }),
      );
    });
  });

  it("supports upload flow in the current folder", async () => {
    vi.mocked(listExplorerEntries)
      .mockResolvedValueOnce({ items: [], next_cursor: "" })
      .mockResolvedValueOnce({
        items: [
          {
            type: "file",
            path: "docs/new.txt",
            name: "new.txt",
            is_empty: null,
            object_key: "docs/new.txt",
            original_filename: "new.txt",
            size: 16,
            content_type: "text/plain",
            etag: "feedface12345678",
            visibility: "private",
            updated_at: "2026-03-25T00:02:00Z",
          },
        ],
        next_cursor: "",
      });

    vi.mocked(uploadObject).mockImplementation(async (_settings, params) => {
      params.onProgress?.(50);
      params.onProgress?.(100);
      return {
        id: 2,
        bucket_name: "demo",
        object_key: "docs/new.txt",
        original_filename: "new.txt",
        size: 16,
        content_type: "text/plain",
        etag: "feedface12345678",
        visibility: "private",
        created_at: "2026-03-25T00:02:00Z",
        updated_at: "2026-03-25T00:02:00Z",
      };
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo?prefix=docs/" },
    );

    await userEvent.click(await screen.findByRole("button", { name: "Upload" }));

    const file = new File(["hello"], "new.txt", { type: "text/plain" });
    await userEvent.upload(await screen.findByLabelText("File"), file);
    await userEvent.type(screen.getByLabelText("Object name"), "new.txt");
    await userEvent.click(screen.getByRole("button", { name: "Start upload" }));

    await waitFor(() => {
      expect(uploadObject).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          objectKey: "docs/new.txt",
        }),
      );
    });

    expect(await screen.findByText("new.txt")).toBeInTheDocument();
  });

  it("creates a folder from the toolbar dialog", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({ items: [], next_cursor: "" });
    vi.mocked(createFolder).mockResolvedValue({
      path: "assets/",
      name: "assets",
      parent_path: "",
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(await screen.findByRole("button", { name: "New folder" }));
    await userEvent.type(
      await screen.findByLabelText("Folder name"),
      "assets",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create folder" }));

    await waitFor(() => {
      expect(createFolder).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        {
          bucket: "demo",
          prefix: "",
          name: "assets",
        },
      );
    });
  });

  it("confirms file deletion before removing an object", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
      items: [
        {
          type: "file",
          path: "docs/readme.txt",
          name: "readme.txt",
          is_empty: null,
          object_key: "docs/readme.txt",
          original_filename: "readme.txt",
          size: 12,
          content_type: "text/plain",
          etag: "abcdef1234567890",
          visibility: "public",
          updated_at: "2026-03-25T00:00:00Z",
        },
      ],
      next_cursor: "",
    });
    vi.mocked(deleteObject).mockResolvedValue(undefined);

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete object?")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteObject).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "demo",
        "docs/readme.txt",
      );
    });
  });
});
