import { useQuery } from "@tanstack/react-query";

// Lightweight liveness ping. /health is proxied to the backend by Vite, so a
// network reject (backend down) or non-2xx both mean "can't reach the server".
async function pingHealth() {
  const resp = await fetch("/health", { cache: "no-store" });
  if (!resp.ok) throw new Error(`Backend unhealthy (${resp.status})`);
  return resp.json();
}

export function useBackendHealth() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: pingHealth,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  // Only treat as down once we've actually had a failed attempt (avoid a flash on first load).
  const isDown = query.isError && query.failureCount > 0;
  // Backend reachable but its database isn't (e.g. external drive unplugged).
  const isDbDown = !isDown && query.data?.database === "error";
  return { isDown, isDbDown, dbError: query.data?.databaseError || null, ...query };
}
