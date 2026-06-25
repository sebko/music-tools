import { WifiOff, HardDrive } from "lucide-react";
import { useBackendHealth } from "../hooks/useBackendHealth";

// App-wide banner shown whenever the backend can't be reached — or it's up but
// its database is unreachable — so neither is ever misread as an empty library.
function ConnectivityBanner() {
  const { isDown, isDbDown, dbError } = useBackendHealth();

  if (isDown) {
    return (
      <div
        role="alert"
        className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-heading"
      >
        <WifiOff className="w-4 h-4 shrink-0" />
        Can&apos;t reach the backend server (port 3001). Is <code className="px-1">npm run dev</code> still running?
      </div>
    );
  }

  if (isDbDown) {
    return (
      <div
        role="alert"
        className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-heading"
      >
        <HardDrive className="w-4 h-4 shrink-0" />
        Music database unavailable — {dbError || "unknown error"}. Once it&apos;s back, restart
        the backend.
      </div>
    );
  }

  return null;
}

export default ConnectivityBanner;
