import { Loader2 } from "lucide-react";

function PageLoader({
  message = "Loading...",
  description = null,
  size = "large"
}) {
  const spinnerSize = size === "small" ? "h-4 w-4" : size === "medium" ? "h-6 w-6" : "h-8 w-8";

  return (
    <div className="flex justify-center items-center py-12">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className={`animate-spin ${spinnerSize} text-main`} />
        <div className="text-center">
          <div className="text-foreground font-heading text-lg">
            {message}
          </div>
          {description && (
            <div className="text-foreground/60 text-sm mt-2">
              {description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PageLoader;
