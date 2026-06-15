import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchRestoreDatesPreview, applyRestoreDates } from "../api/filesToPlex";

export function useRestoreDatesPreview({ enabled = false } = {}) {
  return useQuery({
    queryKey: ["restoreDatesPreview"],
    queryFn: fetchRestoreDatesPreview,
    enabled,
    staleTime: 0,
  });
}

export function useApplyRestoreDates() {
  return useMutation({
    mutationFn: applyRestoreDates,
  });
}
