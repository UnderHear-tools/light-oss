import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { ExplorerFileEntry } from "../../api/types";
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

  it("renders markdown previews as markdown content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(
        "# Hello\n\n- item one\n\n```ts\nconst answer = 42;\n```\n\n<div data-testid=\"raw-html\">unsafe</div>",
      ),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderExplorerTable(createFileEntry({
      content_type: "text/markdown",
      name: "test.md",
      object_key: "docs/test.md",
      original_filename: "test.md",
      path: "docs/test.md",
    }));

    await userEvent.click(screen.getByRole("button", { name: "test.md" }));

    const dialog = await screen.findByRole("dialog");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://oss.underhear.cn/api/v1/buckets/demo/objects/docs/test.md",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await within(dialog).findByRole("heading", { level: 1, name: "Hello" })).toBeInTheDocument();
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

    renderExplorerTable(createFileEntry({
      content_type: "application/octet-stream",
      name: "README.md",
      object_key: "docs/README.md",
      original_filename: "README.md",
      path: "docs/README.md",
    }));

    await userEvent.click(screen.getByRole("button", { name: "README.md" }));

    const dialog = await screen.findByRole("dialog");

    expect(await within(dialog).findByRole("heading", { level: 1, name: "Legacy Markdown" })).toBeInTheDocument();
  });

  it("keeps plain text previews as raw text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("# Plain heading\n- item"),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderExplorerTable(createFileEntry({
      content_type: "text/plain",
      name: "notes.txt",
      object_key: "docs/notes.txt",
      original_filename: "notes.txt",
      path: "docs/notes.txt",
    }));

    await userEvent.click(screen.getByRole("button", { name: "notes.txt" }));

    const dialog = await screen.findByRole("dialog");
    const pre = within(dialog).getByText((_, element) => {
      return element?.tagName === "PRE" && element.textContent === "# Plain heading\n- item";
    });

    expect(pre).toBeInTheDocument();
    expect(within(dialog).queryByText("item", { selector: "li" })).not.toBeInTheDocument();
  });
});

function createFileEntry(overrides: Partial<ExplorerFileEntry>): ExplorerFileEntry {
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

function renderExplorerTable(entry: ExplorerFileEntry) {
  renderWithApp(
    <ExplorerTable
      bucket="demo"
      buildPublicUrl={(objectKey) => `https://oss.underhear.cn/api/v1/buckets/demo/objects/${objectKey}`}
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
      onUpdateVisibility={vi.fn().mockResolvedValue(undefined)}
      publishingPath=""
      signingPath=""
    />,
  );
}
