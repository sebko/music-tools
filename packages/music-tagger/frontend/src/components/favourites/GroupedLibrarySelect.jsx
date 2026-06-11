// Controlled version of the LibraryToggle grouped dropdown: every enabled library,
// grouped under its server name, without touching the global active library.
function GroupedLibrarySelect({ servers, value, onChange, label, disabledId }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="w-full px-3 py-2 rounded-base border-2 border-border bg-background text-foreground text-sm font-heading focus:outline-none focus:border-main"
    >
      <option value="" disabled>
        Select a library…
      </option>
      {servers.map((server) => (
        <optgroup key={server.id} label={server.name}>
          {server.libraries.map((lib) => (
            <option key={lib.id} value={lib.id} disabled={lib.id === disabledId}>
              {lib.title}
              {typeof lib.albumCount === "number" ? ` (${lib.albumCount})` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default GroupedLibrarySelect;
