import { useLibrary } from "../hooks/useLibrary";

// Grouped library switcher: one dropdown listing every enabled library, grouped
// under its server name (e.g. "Laptop ▸ Music / Favourites", "NAS ▸ Jazz").
function LibraryToggle() {
  const { activeLibrary, switchLibrary, servers } = useLibrary();

  const libraryCount = servers.reduce((n, s) => n + s.libraries.length, 0);
  if (libraryCount <= 1) return null;

  return (
    <select
      value={activeLibrary || ""}
      onChange={(e) => switchLibrary(e.target.value)}
      aria-label="Active library"
      className="px-3 py-1.5 rounded-base border-2 border-border bg-background text-foreground text-sm font-heading focus:outline-none focus:border-main"
    >
      {servers.map((server) => (
        <optgroup key={server.id} label={server.name}>
          {server.libraries.map((lib) => (
            <option key={lib.id} value={lib.id}>
              {lib.title}
              {typeof lib.albumCount === "number" ? ` (${lib.albumCount})` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default LibraryToggle;
