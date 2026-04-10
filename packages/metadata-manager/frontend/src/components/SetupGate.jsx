import { Navigate } from "react-router-dom";
import { PageLoader } from "@dj-tools/my-component-library";
import { useSetupStatus } from "../hooks/useSetupStatus";

/**
 * Gates a route on setup completion. Redirects to /setup when setup
 * has not been completed yet. Shows a loader while checking status.
 */
function SetupGate({ children }) {
  const { data, isLoading, isError } = useSetupStatus();

  if (isLoading) {
    return <PageLoader message="Checking setup..." />;
  }

  // If status check fails, fall through to content — don't block the app
  // if the backend hiccups; the user can still navigate manually.
  if (!isError && !data?.setupComplete) {
    return <Navigate to="/setup" replace />;
  }

  return children;
}

export default SetupGate;
