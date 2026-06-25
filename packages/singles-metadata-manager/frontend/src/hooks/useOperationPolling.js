import { useQuery } from "@tanstack/react-query";
import { fetchOperation } from "../api/beets";

/**
 * Polls /api/beets/operations/:id every 1s while the operation is running.
 * Returns the full operation record { status, output, error, ... }.
 */
export function useOperationPolling(operationId) {
  return useQuery({
    queryKey: ["operation", operationId],
    queryFn: () => fetchOperation(operationId),
    enabled: !!operationId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" ? 1000 : false;
    },
  });
}
