import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { ConsolePage } from "./ConsolePage";
import { renderWithApp } from "../test/test-utils";

vi.mock("../api/buckets", () => ({
  listBuckets: vi.fn(),
}));

import { listBuckets } from "../api/buckets";

describe("ConsolePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders overview without bucket creation controls", async () => {
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

    renderWithApp(
      <Routes>
        <Route path="/console" element={<ConsolePage />} />
      </Routes>,
      { route: "/console" },
    );

    expect(
      await screen.findByRole("heading", { name: "Console" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total bucket")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create bucket" }),
    ).not.toBeInTheDocument();
  });
});
