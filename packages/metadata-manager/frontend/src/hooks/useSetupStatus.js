import { useQuery } from "@tanstack/react-query";
import { fetchSetupStatus } from "../api/setup";

export function useSetupStatus() {
  return useQuery({
    queryKey: ["setupStatus"],
    queryFn: fetchSetupStatus,
    staleTime: 1000 * 30,
  });
}
