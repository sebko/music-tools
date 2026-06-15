import { useEffect, useRef } from 'react';

/**
 * Fire `onFinished` once a polled background operation completes. A fast run can
 * finish before we ever observe it running, so any progress snapshot fetched
 * AFTER the start mutation was submitted that shows no active run also counts
 * as finished. A failed start ends here too.
 *
 * @param {Object} op
 * @param {boolean} op.isRunning - whether the operation is currently running
 * @param {Object} op.start - the TanStack mutation that started the operation
 * @param {number} op.progressUpdatedAt - dataUpdatedAt of the progress query
 * @param {Function} onFinished
 */
export function useOperationFinished({ isRunning, start, progressUpdatedAt }, onFinished) {
  const sawRunningRef = useRef(false);

  useEffect(() => {
    if (isRunning) {
      sawRunningRef.current = true;
      return;
    }
    const finishedAfterStart =
      start.isSuccess && progressUpdatedAt > (start.submittedAt ?? Infinity);
    if (sawRunningRef.current || finishedAfterStart || start.isError) onFinished();
  }, [isRunning, progressUpdatedAt, start.isSuccess, start.isError, start.submittedAt, onFinished]);
}
