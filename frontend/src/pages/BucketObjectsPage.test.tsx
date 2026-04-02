import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { BucketObjectsPage } from "./BucketObjectsPage";
import { renderWithApp } from "../test/test-utils";

vi.mock("../api/objects", () => ({
  listExplorerEntries: vi.fn(),
  createFolder: vi.fn(),
  uploadFolder: vi.fn(),
  uploadObject: vi.fn(),
  deleteObject: vi.fn(),
  deleteFolder: vi.fn(),
  downloadFolderZip: vi.fn(),
  updateObjectVisibility: vi.fn(),
  createSignedDownloadURL: vi.fn(),
  buildPublicObjectURL: vi.fn(() => "http://localhost:8080/download"),
}));

vi.mock("../api/sites", () => ({
  createSite: vi.fn(),
  publishObjectSite: vi.fn(),
  uploadFileAndPublishSite: vi.fn(),
  uploadAndPublishSite: vi.fn(),
}));

import {
  createFolder,
  deleteFolder,
  deleteObject,
  downloadFolderZip,
  listExplorerEntries,
  uploadFolder,
  updateObjectVisibility,
  uploadObject,
} from "../api/objects";
import {
  createSite,
  publishObjectSite,
  uploadFileAndPublishSite,
  uploadAndPublishSite,
} from "../api/sites";

describe("BucketObjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete" }),
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

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete folder" }),
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
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
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
