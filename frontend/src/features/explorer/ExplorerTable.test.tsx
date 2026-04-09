import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type {
  ExplorerDirectoryEntry,
  ExplorerEntry,
  ExplorerFileEntry,
} from "../../api/types";
import type { ExplorerSortBy, ExplorerSortOrder } from "../../lib/explorer";
import { renderWithApp } from "../../test/test-utils";
import { ExplorerTable } from "./ExplorerTable";

describe("ExplorerTable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
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
  });

  it("shows sort popover actions and applies sorting only after confirmation", async () => {
    const onSortApply = vi.fn();

    renderExplorerTable(createFileEntry({}), {
      onSortApply,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Sort Size: not sorted" }),
    );

    const title = await screen.findByText("Sort by Size");
    const popover = title.closest(
      "[data-slot='popover-content']",
    ) as HTMLElement | null;

    expect(popover).not.toBeNull();
    expect(
      within(popover!).getByText("Choose an order and confirm to apply it."),
    ).toBeInTheDocument();

    await userEvent.click(
      within(popover!).getByRole("radio", { name: "Descending" }),
    );
    expect(onSortApply).not.toHaveBeenCalled();

    await userEvent.click(
      within(popover!).getByRole("button", { name: "Apply" }),
    );
    expect(onSortApply).toHaveBeenCalledWith("size", "desc");
  });

  it("exposes a clear action for the active sort", async () => {
    const onSortClear = vi.fn();

    renderExplorerTable(createFileEntry({}), {
      onSortClear,
      sortBy: "size",
      sortOrder: "desc",
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Sort Size: descending" }),
    );

    const title = await screen.findByText("Sort by Size");
    const popover = title.closest(
      "[data-slot='popover-content']",
    ) as HTMLElement | null;

    expect(popover).not.toBeNull();

    await userEvent.click(
      within(popover!).getByRole("button", { name: "Clear sorting" }),
    );
    expect(onSortClear).toHaveBeenCalledTimes(1);
  });

  it("keeps file row actions within three visible actions plus an overflow menu", async () => {
    renderExplorerTable(createFileEntry({}));

    expect(
      screen.getByRole("button", { name: "View details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Direct download" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publish site" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(await screen.findByText("Delete object?")).toBeInTheDocument();
  });

  it("keeps directory row actions within three visible actions plus an overflow menu", async () => {
    renderExplorerTable(createDirectoryEntry({}));

    expect(
      screen.getByRole("button", { name: "Open folder" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download ZIP" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publish site" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete folder" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Delete folder" }),
    );

    expect(await screen.findByText("Delete folder?")).toBeInTheDocument();
  });

  it("renders markdown previews as markdown content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi
        .fn()
        .mockResolvedValue(
          '# Hello\n\n- item one\n\n```ts\nconst answer = 42;\n```\n\n<div data-testid="raw-html">unsafe</div>',
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderExplorerTable(
      createFileEntry({
        content_type: "text/markdown",
        name: "test.md",
        object_key: "docs/test.md",
        original_filename: "test.md",
        path: "docs/test.md",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "test.md" }));

    const dialog = await screen.findByRole("dialog");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://oss.underhear.cn/api/v1/buckets/demo/objects/docs/test.md",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(
      await within(dialog).findByRole("heading", { level: 1, name: "Hello" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("item one")).toBeInTheDocument();
    expect(within(dialog).getByText("const answer = 42;")).toBeInTheDocument();
    expect(within(dialog).queryByText("unsafe")).not.toBeInTheDocument();
    expect(within(dialog).queryByTitle("file preview")).not.toBeInTheDocument();
  });

  it("treats markdown filenames as markdown even with legacy content types", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("# Legacy Markdown"),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderExplorerTable(
      createFileEntry({
        content_type: "application/octet-stream",
        name: "README.md",
        object_key: "docs/README.md",
        original_filename: "README.md",
        path: "docs/README.md",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "README.md" }));

    const dialog = await screen.findByRole("dialog");

    expect(
      await within(dialog).findByRole("heading", {
        level: 1,
        name: "Legacy Markdown",
      }),
    ).toBeInTheDocument();
  });

  it("keeps plain text previews as raw text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("# Plain heading\n- item"),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderExplorerTable(
      createFileEntry({
        content_type: "text/plain",
        name: "notes.txt",
        object_key: "docs/notes.txt",
        original_filename: "notes.txt",
        path: "docs/notes.txt",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "notes.txt" }));

    const dialog = await screen.findByRole("dialog");
    const pre = within(dialog).getByText((_, element) => {
      return (
        element?.tagName === "PRE" &&
        element.textContent === "# Plain heading\n- item"
      );
    });

    expect(pre).toBeInTheDocument();
    expect(
      within(dialog).queryByText("item", { selector: "li" }),
    ).not.toBeInTheDocument();
  });

  it("opens image previews in a fullscreen dialog", async () => {
    renderExplorerTable(
      createFileEntry({
        content_type: "image/png",
        name: "avatar.png",
        object_key: "images/avatar.png",
        original_filename: "avatar.png",
        path: "images/avatar.png",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "avatar.png" }));

    const detailsDialog = await screen.findByRole("dialog");
    const inlinePreviewSurface = within(detailsDialog).getByTestId("inline-preview-surface");

    expect(
      within(inlinePreviewSurface).getByRole("button", { name: "Fullscreen preview" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(inlinePreviewSurface).getByRole("button", { name: "Fullscreen preview" }),
    );

    const fullscreenDialog = await screen.findByRole("dialog", {
      name: "avatar.png",
    });

    expect(
      within(fullscreenDialog).getByText("avatar.png"),
    ).toBeInTheDocument();
    expect(
      within(fullscreenDialog).getByAltText("file preview"),
    ).toHaveAttribute(
      "src",
      "https://oss.underhear.cn/api/v1/buckets/demo/objects/images/avatar.png",
    );
  });

  it("uses embedded PDF preview parameters to avoid native viewer overflow", async () => {
    renderExplorerTable(
      createFileEntry({
        content_type: "application/pdf",
        name: "test.pdf",
        object_key: "docs/test.pdf",
        original_filename: "test.pdf",
        path: "docs/test.pdf",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "test.pdf" }));

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByTitle("file preview")).toHaveAttribute(
      "src",
      "https://oss.underhear.cn/api/v1/buckets/demo/objects/docs/test.pdf#toolbar=0&navpanes=0&pagemode=none&view=Fit&zoom=page-fit",
    );
  });

  it.each([
    {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      name: "report.docx",
    },
    {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: "budget.xlsx",
    },
    {
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      name: "deck.pptx",
    },
  ])(
    "does not preview OpenXML office files: $name",
    async ({ contentType, name }) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      renderExplorerTable(
        createFileEntry({
          content_type: contentType,
          name,
          object_key: `docs/${name}`,
          original_filename: name,
          path: `docs/${name}`,
        }),
      );

      await userEvent.click(screen.getByRole("button", { name }));

      const dialog = await screen.findByRole("dialog");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(within(dialog).getByText("Not available")).toBeInTheDocument();
      expect(dialog.querySelector('iframe[title="file preview"]')).toBeNull();
      expect(dialog.querySelector("pre")).toBeNull();
    },
  );

  it.each([
    {
      contentType: "application/xml",
      name: "feed.xml",
    },
    {
      contentType: "application/atom+xml",
      name: "atom.xml",
    },
  ])(
    "keeps real XML content previewable as text: $contentType",
    async ({ contentType, name }) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue("<root><item>value</item></root>"),
      });
      vi.stubGlobal("fetch", fetchMock);

      renderExplorerTable(
        createFileEntry({
          content_type: contentType,
          name,
          object_key: `docs/${name}`,
          original_filename: name,
          path: `docs/${name}`,
        }),
      );

      await userEvent.click(screen.getByRole("button", { name }));

      const dialog = await screen.findByRole("dialog");
      const pre = within(dialog).getByText((_, element) => {
        return (
          element?.tagName === "PRE" &&
          element.textContent === "<root><item>value</item></root>"
        );
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `https://oss.underhear.cn/api/v1/buckets/demo/objects/docs/${name}`,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
      expect(pre).toBeInTheDocument();
    },
  );
});

function createFileEntry(
  overrides: Partial<ExplorerFileEntry>,
): ExplorerFileEntry {
  return {
    type: "file",
    path: "docs/file.txt",
    name: "file.txt",
    is_empty: null,
    object_key: "docs/file.txt",
    original_filename: "file.txt",
    size: 7,
    content_type: "text/plain",
    etag: "etag",
    visibility: "public",
    updated_at: "2026-04-07T01:00:00Z",
    ...overrides,
  };
}

function createDirectoryEntry(
  overrides: Partial<ExplorerDirectoryEntry>,
): ExplorerDirectoryEntry {
  return {
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
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function renderExplorerTable(
  entry: ExplorerEntry,
  options?: {
    onSortApply?: (
      sortBy: ExplorerSortBy,
      sortOrder: ExplorerSortOrder,
    ) => void;
    onSortClear?: () => void;
    sortBy?: ExplorerSortBy | null;
    sortOrder?: ExplorerSortOrder | null;
  },
) {
  renderWithApp(
    <ExplorerTable
      bucket="demo"
      buildPublicUrl={(objectKey) =>
        `https://oss.underhear.cn/api/v1/buckets/demo/objects/${objectKey}`
      }
      deletingPath=""
      downloadingFolderPath=""
      entries={[entry]}
      onDeleteFile={vi.fn().mockResolvedValue(undefined)}
      onDeleteFolder={vi.fn().mockResolvedValue(undefined)}
      onDownloadFolder={vi.fn().mockResolvedValue(undefined)}
      onOpenDirectory={vi.fn()}
      onPublishObjectSite={vi.fn().mockResolvedValue(undefined)}
      onPublishSite={vi.fn().mockResolvedValue(undefined)}
      onSignDownload={vi.fn().mockResolvedValue(undefined)}
      onSortApply={options?.onSortApply ?? vi.fn()}
      onSortClear={options?.onSortClear ?? vi.fn()}
      onUpdateVisibility={vi.fn().mockResolvedValue(undefined)}
      publishingPath=""
      sortBy={options?.sortBy ?? null}
      sortOrder={options?.sortOrder ?? null}
      signingPath=""
    />,
  );
}
