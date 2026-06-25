/**
 * Tests for the Favourites Wizard path/dedup helpers.
 */

import { describe, it, expect } from "vitest";
import { computeRelativeAlbumPath, normalizeKey } from "../../services/favouritesWizard.js";

describe("computeRelativeAlbumPath", () => {
  const locations = [{ id: 1, path: "/Volumes/Music" }];

  it("keeps a flat 'Artist - Album' folder flat", () => {
    expect(computeRelativeAlbumPath("/Volumes/Music/Radiohead - OK Computer", locations)).toBe(
      "Radiohead - OK Computer"
    );
  });

  it("preserves nested Artist/Album structure", () => {
    expect(computeRelativeAlbumPath("/Volumes/Music/Radiohead/OK Computer", locations)).toBe(
      "Radiohead/OK Computer"
    );
  });

  it("matches against the correct root when a section has multiple locations", () => {
    const multi = [
      { id: 1, path: "/Volumes/Music" },
      { id: 2, path: "/Volumes/External/MoreMusic" },
    ];
    expect(computeRelativeAlbumPath("/Volumes/External/MoreMusic/Artist/Album", multi)).toBe(
      "Artist/Album"
    );
  });

  it("does not treat a sibling folder with a shared prefix as inside the root", () => {
    // "/Volumes/Music2/..." is NOT inside "/Volumes/Music"
    expect(computeRelativeAlbumPath("/Volumes/Music2/Artist - Album", locations)).toBe(
      "Artist - Album"
    );
  });

  it("falls back to the folder basename when no root matches", () => {
    expect(computeRelativeAlbumPath("/somewhere/else/Artist - Album", locations)).toBe(
      "Artist - Album"
    );
  });

  it("falls back to basename with empty locations", () => {
    expect(computeRelativeAlbumPath("/a/b/Album", [])).toBe("Album");
  });
});

describe("normalizeKey", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeKey("  Radiohead ", "OK   Computer")).toBe("radiohead|ok computer");
  });

  it("handles missing values", () => {
    expect(normalizeKey(null, undefined)).toBe("|");
  });
});
