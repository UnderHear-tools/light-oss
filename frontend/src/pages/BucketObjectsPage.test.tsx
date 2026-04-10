import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { BucketObjectsPage } from "./BucketObjectsPage";
import { renderWithApp } from "../test/test-utils";

vi.mock("../api/objects", () => ({
  listExplorerEntries: vi.fn(),
  createFolder: vi.fn(),
  checkObjectExists: vi.fn(),
  uploadFolder: vi.fn(),
  uploadObject: vi.fn(),
  deleteExplorerEntriesBatch: vi.fn(),
  deleteObject: vi.fn(),
  deleteFolder: vi.fn(),
  downloadFolderZip: vi.fn(),
  updateObjectVisibility: vi.fn(),
  createSignedDownloadURL: vi.fn(),
  buildPublicObjectURL: vi.fn(() => "http://localhost:8080/download"),
}));

vi.mock("../lib/utils", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/utils")>("../lib/utils");

  return {
    ...actual,
    downloadFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../api/sites", () => ({
  createSite: vi.fn(),
  publishObjectSite: vi.fn(),
  uploadFileAndPublishSite: vi.fn(),
  uploadAndPublishSite: vi.fn(),
}));

import {
  checkObjectExists,
  createFolder,
  createSignedDownloadURL,
  deleteExplorerEntriesBatch,
  deleteFolder,
  deleteObject,
  downloadFolderZip,
  listExplorerEntries,
  uploadFolder,
  updateObjectVisibility,
  uploadObject,
} from "../api/objects";
import { downloadFile } from "../lib/utils";
import {
  createSite,
  publishObjectSite,
  uploadFileAndPublishSite,
  uploadAndPublishSite,
} from "../api/sites";

describe("BucketObjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkObjectExists).mockResolvedValue(false);
    vi.mocked(createSignedDownloadURL).mockResolvedValue({
      url: "http://localhost:8080/signed-download",
      expires_at: 1,
    });
    vi.mocked(downloadFile).mockResolvedValue(undefined);
    vi.mocked(deleteExplorerEntriesBatch).mockResolvedValue({
      deleted_count: 0,
      failed_count: 0,
      failed_items: [],
    });
    Object.defineProperty(Element.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => false),
    });
    Object.defineProperty(Element.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("shows the bucket missing empty state instead of a generic error alert", async () => {
    vi.mocked(listExplorerEntries).mockRejectedValue(
      Object.assign(new Error("bucket not found"), {
        code: "bucket_not_found",
      }),
    );

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    expect(
      await screen.findByText("Open this page again from the bucket list."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Failed to load folder entries"),
    ).not.toBeInTheDocument();
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

  it("applies explorer sorting from the popover and only refetches after confirmation", async () => {
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

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo?cursor=cursor-1" },
    );

    await waitFor(() => {
      expect(listExplorerEntries).toHaveBeenLastCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          cursor: "cursor-1",
          sortBy: "created_at",
          sortOrder: "desc",
        }),
      );
    });

    const initialCallCount = vi.mocked(listExplorerEntries).mock.calls.length;

    await userEvent.click(
      await screen.findByRole("button", { name: "Sort Size: not sorted" }),
    );

    const sizeTitle = await screen.findByText("Sort by Size");
    const sizePopover = sizeTitle.closest(
      "[data-slot='popover-content']",
    ) as HTMLElement | null;
    expect(sizePopover).not.toBeNull();
    expect(
      within(sizePopover!).getByText(
        "Choose an order and confirm to apply it.",
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(listExplorerEntries).toHaveBeenCalledTimes(initialCallCount);
    });

    await userEvent.click(
      within(sizePopover!).getByRole("radio", { name: "Descending" }),
    );

    await waitFor(() => {
      expect(listExplorerEntries).toHaveBeenCalledTimes(initialCallCount);
    });

    await userEvent.click(
      within(sizePopover!).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Sort by Size")).not.toBeInTheDocument();
      expect(listExplorerEntries).toHaveBeenCalledTimes(initialCallCount);
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Sort Size: not sorted" }),
    );

    const reopenedSizeTitle = await screen.findByText("Sort by Size");
    const reopenedSizePopover = reopenedSizeTitle.closest(
      "[data-slot='popover-content']",
    ) as HTMLElement | null;
    expect(reopenedSizePopover).not.toBeNull();

    await userEvent.click(
      within(reopenedSizePopover!).getByRole("button", { name: "Apply" }),
    );

    await waitFor(() => {
      expect(listExplorerEntries).toHaveBeenLastCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          cursor: "",
          sortBy: "size",
          sortOrder: "asc",
        }),
      );
    });

    expect(
      await screen.findByRole("button", { name: "Sort Size: ascending" }),
    ).toBeInTheDocument();

    const appliedAscCallCount =
      vi.mocked(listExplorerEntries).mock.calls.length;

    await userEvent.click(
      screen.getByRole("button", { name: "Sort Size: ascending" }),
    );

    const descendingSizeTitle = await screen.findByText("Sort by Size");
    const descendingSizePopover = descendingSizeTitle.closest(
      "[data-slot='popover-content']",
    ) as HTMLElement | null;
    expect(descendingSizePopover).not.toBeNull();

    await userEvent.click(
      within(descendingSizePopover!).getByRole("radio", {
        name: "Descending",
      }),
    );

    await waitFor(() => {
      expect(listExplorerEntries).toHaveBeenCalledTimes(appliedAscCallCount);
    });

    await userEvent.click(
      within(descendingSizePopover!).getByRole("button", { name: "Apply" }),
    );

    await waitFor(() => {
      expect(listExplorerEntries).toHaveBeenLastCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          cursor: "",
          sortBy: "size",
          sortOrder: "desc",
        }),
      );
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Sort Created: not sorted" }),
    );

    const createdTitle = await screen.findByText("Sort by Created");
    const createdPopover = createdTitle.closest(
      "[data-slot='popover-content']",
    ) as HTMLElement | null;
    expect(createdPopover).not.toBeNull();

    await userEvent.click(
      within(createdPopover!).getByRole("button", { name: "Apply" }),
    );

    await waitFor(() => {
      expect(listExplorerEntries).toHaveBeenLastCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          cursor: "",
          sortBy: "created_at",
          sortOrder: "asc",
        }),
      );
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Sort Created: ascending" }),
    );

    const clearTitle = await screen.findByText("Sort by Created");
    const clearPopover = clearTitle.closest(
      "[data-slot='popover-content']",
    ) as HTMLElement | null;
    expect(clearPopover).not.toBeNull();

    await userEvent.click(
      within(clearPopover!).getByRole("button", { name: "Clear sorting" }),
    );

    await waitFor(() => {
      expect(listExplorerEntries).toHaveBeenLastCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          cursor: "",
          sortBy: "created_at",
          sortOrder: "desc",
        }),
      );
    });
  });

  it("downloads a directory archive and only disables the active row action", async () => {
    let resolveDownload: (() => void) | undefined;
    vi.mocked(listExplorerEntries).mockResolvedValue({
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
        {
          type: "directory",
          path: "images/",
          name: "images",
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
    });
    vi.mocked(downloadFolderZip).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve;
        }),
    );

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    const buttons = await screen.findAllByRole("button", {
      name: "Download ZIP",
    });
    await userEvent.click(buttons[0]);

    await waitFor(() => {
      expect(downloadFolderZip).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "demo",
        "docs/",
      );
    });

    const downloadingButtons = await screen.findAllByRole("button", {
      name: "Downloading ZIP...",
    });
    expect(downloadingButtons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();

    resolveDownload?.();
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Download ZIP" }),
      ).toHaveLength(2);
    });
  });

  it("shows an error toast when folder archive download fails", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
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
    });
    vi.mocked(downloadFolderZip).mockRejectedValue(new Error("archive failed"));

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Download ZIP" }),
    );

    expect(await screen.findByText("archive failed")).toBeInTheDocument();
  });

  it("downloads private files through a signed URL without opening a new tab", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
      items: [
        {
          type: "file",
          path: "docs/private.txt",
          name: "private.txt",
          is_empty: null,
          object_key: "docs/private.txt",
          original_filename: "private-report.txt",
          size: 7,
          content_type: "text/plain",
          etag: "etag",
          visibility: "private",
          updated_at: "2026-04-07T01:00:00Z",
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

    await userEvent.click(
      await screen.findByRole("button", { name: "Signed download" }),
    );

    await waitFor(() => {
      expect(createSignedDownloadURL).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "demo",
        "docs/private.txt",
        300,
      );
      expect(downloadFile).toHaveBeenCalledWith(
        "http://localhost:8080/signed-download?download=true",
        "private-report.txt",
      );
    });
  });

  it("bulk downloads mixed selections in table order and keeps the selection", async () => {
    const events: string[] = [];
    vi.mocked(listExplorerEntries).mockResolvedValue({
      items: [
        {
          type: "file",
          path: "alpha.txt",
          name: "alpha.txt",
          is_empty: null,
          object_key: "alpha.txt",
          original_filename: "alpha-report.txt",
          size: 5,
          content_type: "text/plain",
          etag: "etag-a",
          visibility: "public",
          updated_at: "2026-04-07T01:00:00Z",
        },
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
    });
    vi.mocked(downloadFile).mockImplementation(async (url, filename) => {
      events.push(`file:${filename}:${url}`);
    });
    vi.mocked(downloadFolderZip).mockImplementation(async () => {
      events.push("directory:docs/");
      throw new Error("archive failed");
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select alpha.txt" }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select docs" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Download selected" }),
    );

    await waitFor(() => {
      expect(events).toEqual([
        "file:alpha-report.txt:http://localhost:8080/download?download=true",
        "directory:docs/",
      ]);
    });

    expect(
      await screen.findByText("Downloaded 1 items, 1 failed"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 items selected")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select alpha.txt" }),
    ).toHaveAttribute("data-state", "checked");
    expect(
      screen.getByRole("checkbox", { name: "Select docs" }),
    ).toHaveAttribute("data-state", "checked");
  });

  it("submits mixed selected entries to bulk delete and clears selection after success", async () => {
    vi.mocked(listExplorerEntries)
      .mockResolvedValueOnce({
        items: [
          {
            type: "file",
            path: "alpha.txt",
            name: "alpha.txt",
            is_empty: null,
            object_key: "alpha.txt",
            original_filename: "alpha.txt",
            size: 5,
            content_type: "text/plain",
            etag: "etag-a",
            visibility: "public",
            updated_at: "2026-04-07T01:00:00Z",
          },
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
        items: [],
        next_cursor: "",
      });
    vi.mocked(deleteExplorerEntriesBatch).mockResolvedValue({
      deleted_count: 2,
      failed_count: 0,
      failed_items: [],
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select alpha.txt" }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select docs" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete selected" }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete selected",
      }),
    );

    await waitFor(() => {
      expect(deleteExplorerEntriesBatch).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "demo",
        [
          { type: "file", path: "alpha.txt" },
          { type: "directory", path: "docs/" },
        ],
      );
    });

    expect(await screen.findByText("2 items deleted")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("2 items selected")).not.toBeInTheDocument();
    });
  });

  it("keeps only failed entries selected after a partial bulk delete", async () => {
    vi.mocked(listExplorerEntries)
      .mockResolvedValueOnce({
        items: [
          {
            type: "file",
            path: "alpha.txt",
            name: "alpha.txt",
            is_empty: null,
            object_key: "alpha.txt",
            original_filename: "alpha.txt",
            size: 5,
            content_type: "text/plain",
            etag: "etag-a",
            visibility: "public",
            updated_at: "2026-04-07T01:00:00Z",
          },
          {
            type: "file",
            path: "beta.txt",
            name: "beta.txt",
            is_empty: null,
            object_key: "beta.txt",
            original_filename: "beta.txt",
            size: 4,
            content_type: "text/plain",
            etag: "etag-b",
            visibility: "public",
            updated_at: "2026-04-07T01:00:00Z",
          },
        ],
        next_cursor: "",
      })
      .mockResolvedValueOnce({
        items: [
          {
            type: "file",
            path: "beta.txt",
            name: "beta.txt",
            is_empty: null,
            object_key: "beta.txt",
            original_filename: "beta.txt",
            size: 4,
            content_type: "text/plain",
            etag: "etag-b",
            visibility: "public",
            updated_at: "2026-04-07T01:00:00Z",
          },
        ],
        next_cursor: "",
      });
    vi.mocked(deleteExplorerEntriesBatch).mockResolvedValue({
      deleted_count: 1,
      failed_count: 1,
      failed_items: [
        {
          type: "file",
          path: "beta.txt",
          code: "object_delete_failed",
          message: "failed to delete",
        },
      ],
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select alpha.txt" }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select beta.txt" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete selected" }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete selected",
      }),
    );

    expect(
      await screen.findByText("Deleted 1 items, 1 failed"),
    ).toBeInTheDocument();
    expect(await screen.findByText("1 items selected")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select beta.txt" }),
    ).toHaveAttribute("data-state", "checked");
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

    await userEvent.click(
      await screen.findByRole("button", { name: "Upload" }),
    );

    const file = new File(["hello"], "new.txt", { type: "text/plain" });
    await userEvent.upload(await screen.findByLabelText("File"), file);
    await userEvent.type(screen.getByLabelText("Object name"), "new.txt");
    await userEvent.click(screen.getByRole("button", { name: "Start upload" }));

    await waitFor(() => {
      expect(checkObjectExists).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "demo",
        "docs/new.txt",
      );
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

  it("prompts overwrite before object upload when a conflict is detected", async () => {
    vi.mocked(listExplorerEntries)
      .mockResolvedValueOnce({ items: [], next_cursor: "" })
      .mockResolvedValue({
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

    let resolveOverwriteUpload: (() => void) | undefined;

    vi.mocked(checkObjectExists).mockResolvedValueOnce(true);
    vi.mocked(uploadObject).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOverwriteUpload = () =>
            resolve({
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
            });
        }),
    );

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo?prefix=docs/" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Upload" }),
    );

    const file = new File(["hello"], "new.txt", { type: "text/plain" });
    await userEvent.upload(await screen.findByLabelText("File"), file);
    await userEvent.type(screen.getByLabelText("Object name"), "new.txt");
    await userEvent.click(screen.getByRole("button", { name: "Start upload" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Overwrite existing files?"),
    ).toBeInTheDocument();

    expect(uploadObject).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Overwrite and upload" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    resolveOverwriteUpload?.();

    await waitFor(() => {
      expect(uploadObject).toHaveBeenCalledTimes(1);
      expect(uploadObject).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          objectKey: "docs/new.txt",
          allowOverwrite: true,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Start upload" }),
      ).not.toBeInTheDocument();
    });
  });

  it("cancels object upload when preflight conflict prompt is dismissed", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
      items: [],
      next_cursor: "",
    });
    vi.mocked(checkObjectExists).mockResolvedValueOnce(true);

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo?prefix=docs/" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Upload" }),
    );

    const file = new File(["hello"], "new.txt", { type: "text/plain" });
    await userEvent.upload(await screen.findByLabelText("File"), file);
    await userEvent.type(screen.getByLabelText("Object name"), "new.txt");
    await userEvent.click(screen.getByRole("button", { name: "Start upload" }));

    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() => {
      expect(uploadObject).not.toHaveBeenCalled();
    });
  });

  it("supports folder upload flow in the current folder", async () => {
    vi.mocked(listExplorerEntries)
      .mockResolvedValueOnce({ items: [], next_cursor: "" })
      .mockResolvedValueOnce({
        items: [
          {
            type: "file",
            path: "docs/assets/readme.txt",
            name: "readme.txt",
            is_empty: null,
            object_key: "docs/assets/readme.txt",
            original_filename: "readme.txt",
            size: 16,
            content_type: "text/plain",
            etag: "feedface12345678",
            visibility: "private",
            updated_at: "2026-03-25T00:02:00Z",
          },
        ],
        next_cursor: "",
      });

    vi.mocked(uploadFolder).mockResolvedValue({
      uploaded_count: 2,
      items: [
        {
          id: 2,
          bucket_name: "demo",
          object_key: "docs/assets/readme.txt",
          original_filename: "readme.txt",
          size: 16,
          content_type: "text/plain",
          etag: "feedface12345678",
          visibility: "private",
          created_at: "2026-03-25T00:02:00Z",
          updated_at: "2026-03-25T00:02:00Z",
        },
        {
          id: 3,
          bucket_name: "demo",
          object_key: "docs/assets/images/logo.png",
          original_filename: "logo.png",
          size: 24,
          content_type: "image/png",
          etag: "deadbeef12345678",
          visibility: "private",
          created_at: "2026-03-25T00:02:00Z",
          updated_at: "2026-03-25T00:02:00Z",
        },
      ],
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo?prefix=docs/" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Upload folder" }),
    );

    const readme = new File(["hello"], "readme.txt", { type: "text/plain" });
    const logo = new File(["png"], "logo.png", { type: "image/png" });
    Object.defineProperty(readme, "webkitRelativePath", {
      configurable: true,
      value: "assets/readme.txt",
    });
    Object.defineProperty(logo, "webkitRelativePath", {
      configurable: true,
      value: "assets/images/logo.png",
    });

    await userEvent.upload(await screen.findByLabelText("Folder"), [
      readme,
      logo,
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Start folder upload" }),
    );

    await waitFor(() => {
      expect(checkObjectExists).toHaveBeenNthCalledWith(
        1,
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "demo",
        "docs/assets/readme.txt",
      );
      expect(checkObjectExists).toHaveBeenNthCalledWith(
        2,
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "demo",
        "docs/assets/images/logo.png",
      );
      expect(uploadFolder).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          prefix: "docs/",
          files: [readme, logo],
        }),
      );
    });

    expect(await screen.findByText("readme.txt")).toBeInTheDocument();
  });

  it("prompts overwrite before folder upload when a conflict is detected", async () => {
    vi.mocked(listExplorerEntries)
      .mockResolvedValueOnce({ items: [], next_cursor: "" })
      .mockResolvedValue({
        items: [
          {
            type: "file",
            path: "docs/assets/readme.txt",
            name: "readme.txt",
            is_empty: null,
            object_key: "docs/assets/readme.txt",
            original_filename: "readme.txt",
            size: 16,
            content_type: "text/plain",
            etag: "feedface12345678",
            visibility: "private",
            updated_at: "2026-03-25T00:02:00Z",
          },
        ],
        next_cursor: "",
      });

    let resolveOverwriteUpload: (() => void) | undefined;

    vi.mocked(checkObjectExists).mockResolvedValueOnce(true);
    vi.mocked(uploadFolder).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOverwriteUpload = () =>
            resolve({
              uploaded_count: 1,
              items: [
                {
                  id: 2,
                  bucket_name: "demo",
                  object_key: "docs/assets/readme.txt",
                  original_filename: "readme.txt",
                  size: 16,
                  content_type: "text/plain",
                  etag: "feedface12345678",
                  visibility: "private",
                  created_at: "2026-03-25T00:02:00Z",
                  updated_at: "2026-03-25T00:02:00Z",
                },
              ],
            });
        }),
    );

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo?prefix=docs/" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Upload folder" }),
    );

    const readme = new File(["hello"], "readme.txt", { type: "text/plain" });
    Object.defineProperty(readme, "webkitRelativePath", {
      configurable: true,
      value: "assets/readme.txt",
    });

    await userEvent.upload(await screen.findByLabelText("Folder"), [readme]);
    await userEvent.click(
      screen.getByRole("button", { name: "Start folder upload" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(uploadFolder).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Overwrite and upload" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    resolveOverwriteUpload?.();

    await waitFor(() => {
      expect(uploadFolder).toHaveBeenCalledTimes(1);
      expect(uploadFolder).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        expect.objectContaining({
          bucket: "demo",
          prefix: "docs/",
          files: [readme],
          allowOverwrite: true,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Start folder upload" }),
      ).not.toBeInTheDocument();
    });
  });

  it("uploads a folder and publishes a site from the toolbar", async () => {
    vi.mocked(listExplorerEntries)
      .mockResolvedValueOnce({ items: [], next_cursor: "" })
      .mockResolvedValueOnce({
        items: [
          {
            type: "directory",
            path: "docs/dist/",
            name: "dist",
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
      });
    vi.mocked(uploadAndPublishSite).mockResolvedValue({
      uploaded_count: 2,
      site: {
        id: 8,
        bucket: "demo",
        root_prefix: "docs/dist/",
        enabled: true,
        index_document: "index.html",
        error_document: "",
        spa_fallback: true,
        domains: ["demo.underhear.cn"],
        created_at: "2026-03-30T00:00:00Z",
        updated_at: "2026-03-30T00:00:00Z",
      },
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo?prefix=docs/" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Upload and publish" }),
    );

    const dialog = await screen.findByRole("dialog");
    const indexFile = new File(["<html>home</html>"], "index.html", {
      type: "text/html",
    });
    const appFile = new File(["console.log('demo')"], "app.js", {
      type: "application/javascript",
    });
    Object.defineProperty(indexFile, "webkitRelativePath", {
      configurable: true,
      value: "dist/index.html",
    });
    Object.defineProperty(appFile, "webkitRelativePath", {
      configurable: true,
      value: "dist/assets/app.js",
    });

    await userEvent.upload(within(dialog).getByLabelText("Folder"), [
      indexFile,
      appFile,
    ]);
    expect(within(dialog).getByText("docs/dist/")).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByLabelText("Domains"),
      "demo.underhear.cn",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Upload and publish" }),
    );

    await waitFor(() => {
      expect(uploadAndPublishSite).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        {
          bucket: "demo",
          parentPrefix: "docs/",
          files: [indexFile, appFile],
          domains: ["demo.underhear.cn"],
          enabled: true,
          indexDocument: "index.html",
          errorDocument: "",
          spaFallback: true,
          onProgress: expect.any(Function),
        },
      );
    });

    expect(await screen.findByText("Site published")).toBeInTheDocument();
  });

  it("uploads a file and publishes a site from the toolbar", async () => {
    vi.mocked(listExplorerEntries)
      .mockResolvedValueOnce({ items: [], next_cursor: "" })
      .mockResolvedValueOnce({
        items: [
          {
            type: "file",
            path: "docs/landing.html",
            name: "landing.html",
            is_empty: null,
            object_key: "docs/landing.html",
            original_filename: "landing.html",
            size: 18,
            content_type: "text/html",
            etag: "feedface12345678",
            visibility: "public",
            updated_at: "2026-03-25T00:02:00Z",
          },
        ],
        next_cursor: "",
      });
    vi.mocked(uploadFileAndPublishSite).mockResolvedValue({
      id: 9,
      bucket: "demo",
      root_prefix: "docs/",
      enabled: true,
      index_document: "landing.html",
      error_document: "",
      spa_fallback: true,
      domains: ["demo.underhear.cn"],
      created_at: "2026-03-30T00:00:00Z",
      updated_at: "2026-03-30T00:00:00Z",
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo?prefix=docs/" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Upload and publish" }),
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("tab", { name: "Upload file and publish" }),
    );

    const landingFile = new File(["<html>home</html>"], "landing.html", {
      type: "text/html",
    });
    await userEvent.upload(within(dialog).getByLabelText("File"), landingFile);
    expect(within(dialog).getAllByText("docs/")).toHaveLength(2);
    expect(within(dialog).getByText("landing.html")).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByLabelText("Domains"),
      "demo.underhear.cn",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Upload and publish" }),
    );

    await waitFor(() => {
      expect(uploadFileAndPublishSite).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        {
          bucket: "demo",
          parentPrefix: "docs/",
          file: landingFile,
          domains: ["demo.underhear.cn"],
          enabled: true,
          errorDocument: "",
          spaFallback: true,
          onProgress: expect.any(Function),
        },
      );
    });

    expect(await screen.findByText("Site published")).toBeInTheDocument();
  });

  it("shows an error toast when folder upload fails", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
      items: [],
      next_cursor: "",
    });
    vi.mocked(uploadFolder).mockRejectedValue(
      new Error("folder upload failed"),
    );

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo?prefix=docs/" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Upload folder" }),
    );

    const readme = new File(["hello"], "readme.txt", { type: "text/plain" });
    Object.defineProperty(readme, "webkitRelativePath", {
      configurable: true,
      value: "assets/readme.txt",
    });

    await userEvent.upload(await screen.findByLabelText("Folder"), readme);
    await userEvent.click(
      screen.getByRole("button", { name: "Start folder upload" }),
    );

    expect(await screen.findByText("folder upload failed")).toBeInTheDocument();
  });

  it("creates a folder from the toolbar dialog", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
      items: [],
      next_cursor: "",
    });
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

    await userEvent.click(
      await screen.findByRole("button", { name: "New folder" }),
    );
    await userEvent.type(await screen.findByLabelText("Folder name"), "assets");
    await userEvent.click(
      screen.getByRole("button", { name: "Create folder" }),
    );

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

    const fileRow = await screen.findByRole("row", { name: /readme\.txt/ });
    await userEvent.click(
      within(fileRow).getByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete object?")).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(deleteObject).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "demo",
        "docs/readme.txt",
      );
    });
  });

  it("supports recursive folder deletion from the table", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
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
    });
    vi.mocked(deleteFolder).mockResolvedValue(undefined);

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    const folderRow = await screen.findByRole("row", { name: /docs/ });
    await userEvent.click(
      within(folderRow).getByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete folder" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete folder?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "This removes the folder docs from demo together with all nested files and folders.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(deleteFolder).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        "demo",
        "docs/",
        { recursive: true },
      );
    });
  });

  it("shows publish site for both directory and file rows", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
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

    expect(
      await screen.findAllByRole("button", { name: "Publish site" }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "More actions" }),
    ).toHaveLength(2);
  });

  it("publishes a folder as a site from the explorer table", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
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
    });
    vi.mocked(createSite).mockResolvedValue({
      id: 1,
      bucket: "demo",
      root_prefix: "docs/",
      enabled: true,
      index_document: "index.html",
      error_document: "",
      spa_fallback: true,
      domains: ["demo.underhear.cn", "www.underhear.cn"],
      created_at: "2026-03-30T00:00:00Z",
      updated_at: "2026-03-30T00:00:00Z",
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Publish site" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("demo")).toBeInTheDocument();
    expect(within(dialog).getByText("docs/")).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByLabelText("Domains"),
      "demo.underhear.cn, www.underhear.cn",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Publish site" }),
    );

    await waitFor(() => {
      expect(createSite).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        {
          bucket: "demo",
          root_prefix: "docs/",
          enabled: true,
          index_document: "index.html",
          error_document: "",
          spa_fallback: true,
          domains: ["demo.underhear.cn", "www.underhear.cn"],
        },
      );
    });

    expect(await screen.findByText("Site published")).toBeInTheDocument();
  });

  it("publishes a file as a site from the explorer table", async () => {
    vi.mocked(listExplorerEntries)
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
            visibility: "private",
            updated_at: "2026-03-25T00:00:00Z",
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
    vi.mocked(publishObjectSite).mockResolvedValue({
      id: 9,
      bucket: "demo",
      root_prefix: "docs/",
      enabled: true,
      index_document: "readme.txt",
      error_document: "",
      spa_fallback: true,
      domains: ["demo.underhear.cn"],
      created_at: "2026-03-30T00:00:00Z",
      updated_at: "2026-03-30T00:00:00Z",
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Publish site" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("demo")).toBeInTheDocument();
    expect(within(dialog).getByText("docs/")).toBeInTheDocument();
    expect(within(dialog).getByText("readme.txt")).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByLabelText("Domains"),
      "demo.underhear.cn",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Publish site" }),
    );

    await waitFor(() => {
      expect(publishObjectSite).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        {
          bucket: "demo",
          objectKey: "docs/readme.txt",
          domains: ["demo.underhear.cn"],
          enabled: true,
          errorDocument: "",
          spaFallback: true,
        },
      );
    });

    expect(await screen.findByText("Site published")).toBeInTheDocument();
  });

  it("shows a site publish error toast when the request fails", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
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
    });
    vi.mocked(createSite).mockRejectedValue(new Error("publish failed"));

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Publish site" }),
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText("Domains"),
      "demo.underhear.cn",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Publish site" }),
    );

    expect(await screen.findByText("publish failed")).toBeInTheDocument();
  });

  it("shows a success toast after copying a public URL", async () => {
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

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Copy URL" }),
    );

    await waitFor(() => {
      expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
        "http://localhost:8080/download",
      );
    });

    expect(await screen.findByText("URL copied")).toBeInTheDocument();
  });

  it("opens a file details dialog from the actions column", async () => {
    vi.mocked(listExplorerEntries).mockResolvedValue({
      items: [
        {
          type: "file",
          path: "images/avatar.png",
          name: "avatar.png",
          is_empty: null,
          object_key: "images/avatar.png",
          original_filename: "avatar.png",
          size: 4096,
          content_type: "image/png",
          etag: "abc123",
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

    await userEvent.click(
      await screen.findByRole("button", { name: "View details" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("File details")).toBeInTheDocument();
    expect(within(dialog).getByText("avatar.png")).toBeInTheDocument();
    expect(within(dialog).getByText("image/png")).toBeInTheDocument();
    expect(within(dialog).getByAltText("file preview")).toHaveAttribute(
      "src",
      "http://localhost:8080/download",
    );
  });

  it("updates visibility from file details and refreshes entries", async () => {
    vi.mocked(listExplorerEntries)
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
            visibility: "private",
            updated_at: "2026-03-25T00:00:00Z",
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

    vi.mocked(updateObjectVisibility).mockResolvedValue({
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
    });

    renderWithApp(
      <Routes>
        <Route path="/buckets/:bucket" element={<BucketObjectsPage />} />
      </Routes>,
      { route: "/buckets/demo" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "View details" }),
    );

    await userEvent.click(
      await screen.findByRole("combobox", { name: "Visibility" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Public" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateObjectVisibility).toHaveBeenCalledWith(
        { apiBaseUrl: "http://localhost:8080", bearerToken: "dev-token" },
        {
          bucket: "demo",
          objectKey: "docs/readme.txt",
          visibility: "public",
        },
      );
    });

    expect(
      await screen.findByText("Object visibility updated"),
    ).toBeInTheDocument();
  });
});
