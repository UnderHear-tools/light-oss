import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../lib/settings";
import {
  buildPublicObjectURL,
  deleteFolder,
  downloadFolderZip,
  updateObjectVisibility,
  uploadFolder,
  uploadObject,
} from "./objects";

const request = vi.fn();
const apiRequestMock = vi.fn();

vi.mock("./client", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  createApiClient: vi.fn(() => ({
    request,
  })),
}));

const settings: AppSettings = {
  apiBaseUrl: "https://oss.underhear.cn",
  bearerToken: "dev-token",
};

describe("objects api helpers", () => {
  beforeEach(() => {
    request.mockReset();
    apiRequestMock.mockReset();
    request.mockResolvedValue({
      data: {
        data: {
          id: 1,
        },
      },
    });
    apiRequestMock.mockResolvedValue({
      id: 1,
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:folder-zip"),
      revokeObjectURL: vi.fn(),
    });
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("encodes dots in object keys for upload requests", async () => {
    const file = new File(["sql"], "underhear.postgresql.sql", {
      type: "application/sql",
    });

    await uploadObject(settings, {
      bucket: "demo",
      objectKey: "docs/underhear.postgresql.sql",
      file,
      visibility: "private",
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 0,
        url: "/api/v1/buckets/demo/objects/docs/underhear%2Epostgresql%2Esql",
      }),
    );
  });

  it("encodes dots when building a public object URL", () => {
    expect(
      buildPublicObjectURL(
        "https://oss.underhear.cn/",
        "demo",
        "docs/underhear.postgresql.sql",
      ),
    ).toBe(
      "https://oss.underhear.cn/api/v1/buckets/demo/objects/docs/underhear%2Epostgresql%2Esql",
    );
  });

  it("calls visibility update endpoint with encoded object key", async () => {
    await updateObjectVisibility(settings, {
      bucket: "demo",
      objectKey: "docs/underhear.postgresql.sql",
      visibility: "public",
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      settings,
      expect.objectContaining({
        method: "PATCH",
        url: "/api/v1/buckets/demo/objects/visibility/docs/underhear%2Epostgresql%2Esql",
        data: { visibility: "public" },
      }),
    );
  });

  it("builds a multipart batch upload request for folders", async () => {
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

    await uploadFolder(settings, {
      bucket: "demo",
      prefix: "docs/",
      files: [readme, logo],
      visibility: "private",
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        timeout: 0,
        url: "/api/v1/buckets/demo/objects/batch",
      }),
    );

    const formData = request.mock.calls[0]?.[0]?.data as FormData;
    expect(formData.get("prefix")).toBe("docs/");
    expect(formData.get("visibility")).toBe("private");
    expect(formData.get("manifest")).toBe(
      JSON.stringify([
        { file_field: "file_0", relative_path: "assets/readme.txt" },
        { file_field: "file_1", relative_path: "assets/images/logo.png" },
      ]),
    );
    expect(formData.get("file_0")).toBeInstanceOf(File);
    expect((formData.get("file_0") as File).name).toBe("readme.txt");
    expect(formData.get("file_1")).toBeInstanceOf(File);
    expect((formData.get("file_1") as File).name).toBe("logo.png");
  });

  it("passes recursive deletion to the folder endpoint when requested", async () => {
    await deleteFolder(settings, "demo", "docs/", { recursive: true });

    expect(apiRequestMock).toHaveBeenCalledWith(
      settings,
      expect.objectContaining({
        method: "DELETE",
        url: "/api/v1/buckets/demo/folders",
        params: {
          path: "docs/",
          recursive: true,
        },
      }),
    );
  });

  it("downloads folder archives as blobs and honors the response filename", async () => {
    request.mockResolvedValue({
      data: new Blob(["zip-content"], { type: "application/zip" }),
      headers: {
        "content-disposition": `attachment; filename*=UTF-8''docs%20archive.zip`,
      },
    });

    await downloadFolderZip(settings, "demo", "docs/");

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        timeout: 0,
        url: "/api/v1/buckets/demo/folders/archive",
        params: {
          path: "docs/",
        },
        responseType: "blob",
      }),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:folder-zip");
  });

  it("falls back to the folder name when archive headers are missing", async () => {
    const createdLinks: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, "createElement");
    createElementSpy.mockImplementation(
      ((tagName: string, options?: ElementCreationOptions) => {
        const element = originalCreateElement(tagName, options);
        if (tagName.toLowerCase() === "a") {
          createdLinks.push(element as HTMLAnchorElement);
        }
        return element;
      }) as typeof document.createElement,
    );

    request.mockResolvedValue({
      data: new Blob(["zip-content"], { type: "application/zip" }),
      headers: {},
    });

    await downloadFolderZip(settings, "demo", "docs/nested/");

    expect(createdLinks[0]?.download).toBe("nested.zip");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();

    createElementSpy.mockRestore();
  });
});
