import { describe, expect, it } from "vitest";
import { explorerPageSizes, parseExplorerLimit } from "./explorer";

describe("explorer helpers", () => {
  it("includes 10, 20, and 1000 in the supported page sizes", () => {
    expect(explorerPageSizes).toContain(10);
    expect(explorerPageSizes).toContain(20);
    expect(explorerPageSizes).toContain(1000);
  });

  it("accepts 10, 20, and 1000 as valid explorer page limits", () => {
    expect(parseExplorerLimit("10")).toBe(10);
    expect(parseExplorerLimit("20")).toBe(20);
    expect(parseExplorerLimit("1000")).toBe(1000);
  });

  it("defaults to 20 when the limit is unsupported", () => {
    expect(parseExplorerLimit("15")).toBe(20);
    expect(parseExplorerLimit(null)).toBe(20);
  });
});
