import { useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchServers, switchActiveLibrary } from "../api/settings";
import { setActiveLibraryHeader } from "../api/client";
import { LibraryContext } from "./libraryContext.js";

export function LibraryProvider({ children }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Enabled servers -> libraries (+ counts) and the persisted active library id.
  // This query is foundational (every library selector feeds off it), so when it
  // errors (e.g. the page loaded while the backend was restarting) keep retrying
  // instead of sitting on an empty server list forever.
  const { data, isLoading: serversLoading, isError: serversError, error: serversErrorDetail, refetch: refetchServers } = useQuery({
    queryKey: ["servers"],
    queryFn: fetchServers,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => (query.state.status === "error" ? 5000 : false),
    // Renders above the app error boundary and has its own error handling
    // (GroupedLibrarySelect / header switcher) — never throw.
    throwOnError: false,
  });

  const servers = useMemo(() => data?.servers || [], [data]);
  const libraries = useMemo(
    () => servers.flatMap((s) => s.libraries.map((l) => ({ ...l, serverId: s.id, serverName: s.name }))),
    [servers]
  );

  // Derive the active library id: URL param > last known > backend > first enabled.
  const urlLibrary = searchParams.get("library");
  const backendLibrary = data?.activeLibraryId;
  const lastKnownRef = useRef(null);
  const activeLibrary =
    urlLibrary || lastKnownRef.current || backendLibrary || libraries[0]?.id || null;

  useEffect(() => {
    if (urlLibrary) lastKnownRef.current = urlLibrary;
    else if (backendLibrary) lastKnownRef.current = backendLibrary;
  }, [urlLibrary, backendLibrary]);

  // Ensure ?library= is present once we know one (only when there's a choice to make).
  useEffect(() => {
    if (!urlLibrary && activeLibrary && libraries.length > 1) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("library", activeLibrary);
        return next;
      }, { replace: true });
    }
  }, [urlLibrary, activeLibrary, libraries.length, setSearchParams]);

  // Keep the API header in sync synchronously so queries carry the right library id.
  setActiveLibraryHeader(activeLibrary);

  const activeLibraryName = useMemo(
    () => libraries.find((l) => l.id === activeLibrary)?.title || null,
    [libraries, activeLibrary]
  );

  const switchLibrary = useCallback(
    async (newLibraryId) => {
      lastKnownRef.current = newLibraryId;
      setActiveLibraryHeader(newLibraryId);

      navigate(`/?library=${encodeURIComponent(newLibraryId)}`);

      // Refresh library-scoped queries for the new library, plus the header
      // switcher's per-library counts.
      await queryClient.invalidateQueries({ queryKey: ["albums"] });
      await queryClient.invalidateQueries({ queryKey: ["album"] });
      await queryClient.invalidateQueries({ queryKey: ["syncFailures"] });
      await queryClient.invalidateQueries({ queryKey: ["syncFailureCounts"] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });

      try {
        await switchActiveLibrary(newLibraryId);
      } catch (err) {
        console.error("Failed to persist library switch:", err);
      }
    },
    [queryClient, navigate]
  );

  return (
    <LibraryContext.Provider
      value={{
        activeLibrary,
        activeLibraryName,
        switchLibrary,
        servers,
        libraries,
        serversLoading,
        serversError,
        serversErrorDetail,
        refetchServers,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}
