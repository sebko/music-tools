import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchPlexSettings,
  savePlexSettings,
  disconnectPlex,
  startPlexOAuth,
  fetchPlexLibraries,
} from "../api/settings";

export function usePlexSettings() {
  return useQuery({
    queryKey: ["plexSettings"],
    queryFn: fetchPlexSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSavePlexSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: savePlexSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plexSettings"] });
    },
  });
}

export function useDisconnectPlex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectPlex,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plexSettings"] });
    },
  });
}

export function useStartPlexOAuth() {
  return useMutation({
    mutationFn: startPlexOAuth,
  });
}

export function usePlexLibraries(serverName) {
  return useQuery({
    queryKey: ["plexLibraries", serverName],
    queryFn: () => fetchPlexLibraries(serverName),
    enabled: !!serverName,
    staleTime: 2 * 60 * 1000,
  });
}
