import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { BucketObjectsPage } from "./BucketObjectsPage";
import { renderWithApp } from "../test/test-utils";

vi.mock("../api/objects", () => ({
  listObjects: vi.fn(),
  uploadObject: vi.fn(),
  deleteObject: vi.fn(),
  createSignedDownloadURL: vi.fn(),
  buildPublicObjectURL: vi.fn(() => "http://localhost:8080/download"),
}));

import { listObjects, uploadObject } from "../api/objects";

describe("BucketObjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders object list", async () => {
    vi.mocked(listObjects).mockResolvedValue({
      items: [
        {
          id: 1,
          bucket_name: "demo",
          object_key: "docs/readme.txt",
          original_filename: "readme.txt",
          size: 12,
          content_type: "text/plain",
          etag: "abcdef1234567890",
          visibility: "public",
          created_at: "2026-03-25T00:00:00Z",
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

    expect(await screen.findByText("docs/readme.txt")).toBeInTheDocument();
  });

  it("supports upload flow", async () => {
    vi.mocked(listObjects)
      .mockResolvedValueOnce({ items: [], next_cursor: "" })
      .mockResolvedValueOnce({
        items: [
          {
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
      { route: "/buckets/demo" },
    );

    const file = new File(["hello"], "new.txt", { type: "text/plain" });
    await userEvent.upload(screen.getByLabelText("File"), file);
    await userEvent.type(screen.getByLabelText("Object Key"), "docs/new.txt");
    await userEvent.click(
      screen.getByRole("button", { name: "Upload Object" }),
    );

    await waitFor(() => {
      expect(uploadObject).toHaveBeenCalled();
    });

    expect(await screen.findByText("docs/new.txt")).toBeInTheDocument();
  });
});
