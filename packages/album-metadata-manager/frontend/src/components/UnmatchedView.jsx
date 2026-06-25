import { Music, Search } from "lucide-react";
import { Button } from "@music-tools/my-component-library";

function UnmatchedView({ onButtonClick, isStarting = false, buttonText = "File Scan" }) {
  return (
    <div className="flex-col py-12 justify-center text-center">
      <div className="mb-4">
        <Music className="w-16 h-16 mx-auto text-main animate-pulse" />
      </div>
      <h2 className="text-xl font-heading text-foreground mb-2">No albums yet</h2>
      <p className="text-foreground/60 mb-6">
        Start by scanning your music library to import albums.
      </p>
      <div>
        <Button
          onClick={onButtonClick}
          variant="primary"
          size="lg"
          isDisabled={isStarting}
        >
          <Search className="w-5 h-5" />
          {isStarting ? "Starting..." : buttonText}
        </Button>
      </div>
    </div>
  );
}

export default UnmatchedView;