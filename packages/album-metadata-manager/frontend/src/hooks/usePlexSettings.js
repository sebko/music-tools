import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchPlexSettings,
  disconnectPlex,
  startPlexOAuth,
  savePlexSelection,
} from "../api/settings";

export function usePlexSettings() {
  return useQuery({
    queryKey: ["plexSettings"],
    queryFn: fetchPlexSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDisconnectPlex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectPlex,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plexSettings"] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });
}

export function useStartPlexOAuth() {
  return useMutation({
    mutationFn: startPlexOAuth,
  });
}

// Enable a chosen set of libraries (and their servers).
export function useSavePlexSelection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: savePlexSelection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plexSettings"] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });
}
