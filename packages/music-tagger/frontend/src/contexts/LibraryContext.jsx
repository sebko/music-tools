import { useEffect, useCallback, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPlexSettings, switchActiveLibrary } from "../api/settings";
import { setActiveLibraryHeader } from "../api/client";
import { LibraryContext } from "./libraryContext.js";

export function LibraryProvider({ children }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: settings } = useQuery({
    queryKey: ["plexSettings"],
    queryFn: fetchPlexSettings,
    staleTime: 5 * 60 * 1000,
  });

  const availableLibraries = settings?.availableLibraries || [];

  // Tracks an in-progress library switch so pages can show a loading indicator
  const [isSwitching, setIsSwitching] = useState(false);

  // Derive active library: URL param > last known > backend setting > default
  const urlLibrary = searchParams.get("library");
  const backendLibrary = settings?.activeLibraryName;
  const lastKnownRef = useRef(backendLibrary || "Music");
  const activeLibrary = urlLibrary || lastKnownRef.current;

  // Track the most recently known library so we can restore it after navigation
  useEffect(() => {
    if (urlLibrary) {
      lastKnownRef.current = urlLibrary;
    } else if (backendLibrary) {
      lastKnownRef.current = backendLibrary;
    }
  }, [urlLibrary, backendLibrary]);

  // Ensure ?library= is always in the URL
  useEffect(() => {
    if (!urlLibrary && availableLibraries.length > 1) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("library", activeLibrary);
        return next;
      }, { replace: true });
    }
  }, [urlLibrary, activeLibrary, availableLibraries.length, setSearchParams]);

  // Keep API header in sync — set synchronously so it's correct before queries fire
  setActiveLibraryHeader(activeLibrary);

  const switchLibrary = useCallback(async (newLibrary) => {
    setIsSwitching(true);
    try {
      lastKnownRef.current = newLibrary;
      setActiveLibraryHeader(newLibrary);

      // Navigate to home with new library param
      navigate(`/?library=${encodeURIComponent(newLibrary)}`);

      // Invalidate all library-scoped queries to force refetch
      await queryClient.invalidateQueries({ queryKey: ["albums"] });
      await queryClient.invalidateQueries({ queryKey: ["album"] });
      await queryClient.invalidateQueries({ queryKey: ["syncFailures"] });
      await queryClient.invalidateQueries({ queryKey: ["syncFailureCounts"] });

      // Persist to backend
      try {
        await switchActiveLibrary(newLibrary);
      } catch (err) {
        console.error("Failed to persist library switch:", err);
      }
    } finally {
      setIsSwitching(false);
    }
  }, [queryClient, navigate]);

  return (
    <LibraryContext.Provider value={{ activeLibrary, switchLibrary, availableLibraries, isSwitching }}>
      {children}
    </LibraryContext.Provider>
  );
}
