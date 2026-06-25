import { Component } from "react";
import { useLocation } from "react-router-dom";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Button, EmptyState } from "@music-tools/my-component-library";
import { AlertTriangle, RefreshCw } from "lucide-react";

class ErrorBoundaryInner extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled page error:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.renderFallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}

// App-wide catch-all: any render error — including queries that fail with no
// data to show (see queryClient throwOnError) — lands on one generic error
// screen with a Retry that resets the failed queries and re-renders. Keyed by
// route so navigating away always clears the error.
function AppErrorBoundary({ children }) {
  const location = useLocation();

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundaryInner
          key={location.pathname}
          renderFallback={(error, resetBoundary) => (
            <EmptyState
              icon={<AlertTriangle className="w-16 h-16 text-red-500" />}
              heading="Something went wrong"
              description={error?.message || "An unexpected error occurred. Please try again."}
              action={
                <Button
                  onClick={() => {
                    reset();
                    resetBoundary();
                  }}
                  variant="primary"
                  size="lg"
                >
                  <RefreshCw className="w-5 h-5" /> Try again
                </Button>
              }
            />
          )}
        >
          {children}
        </ErrorBoundaryInner>
      )}
    </QueryErrorResetBoundary>
  );
}

export default AppErrorBoundary;
