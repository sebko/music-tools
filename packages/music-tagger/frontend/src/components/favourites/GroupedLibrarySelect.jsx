import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLibrary } from "../../hooks/useLibrary";

// Controlled version of the LibraryToggle grouped dropdown: every enabled library,
// grouped under its server name, without touching the global active library.
// Pulls the server list (and its loading/error state) from LibraryContext so an
// unreachable backend shows as an error, never as a silently empty dropdown.
function GroupedLibrarySelect({ value, onChange, label, disabledId }) {
  const { servers, serversLoading, serversError, serversErrorDetail, refetchServers } =
    useLibrary();

  if (serversLoading) {
    return (
      <select
        disabled
        aria-label={label}
        className="w-full px-3 py-2 rounded-base border-2 border-border bg-background text-muted-foreground text-sm font-heading"
      >
        <option>Loading libraries…</option>
      </select>
    );
  }

  if (serversError) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1">
          Couldn't load libraries: {serversErrorDetail?.message || "unknown error"}
        </span>
        <button
          type="button"
          onClick={() => refetchServers()}
          className="flex items-center gap-1 px-2 py-1 rounded-base border-2 border-border bg-background text-foreground font-heading"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Plex libraries found.{" "}
        <Link to="/settings" className="underline text-foreground">
          Connect Plex in Settings
        </Link>
        .
      </p>
    );
  }

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
