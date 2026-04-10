import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./utils";

describe("downloadFile", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("keeps the temporary link long enough for the browser to register the download", async () => {
    vi.useFakeTimers();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const downloadPromise = downloadFile(
      "http://localhost:8080/files/report.txt",
      "report.txt",
    );

    const link = document.querySelector("a");
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect(link).toHaveAttribute(
      "href",
      "http://localhost:8080/files/report.txt",
    );
    expect(link).toHaveAttribute("download", "report.txt");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(149);
    expect(document.querySelector("a")).not.toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await downloadPromise;

    expect(document.querySelector("a")).toBeNull();
  });
});
