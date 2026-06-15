import { Music, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@music-tools/my-component-library";

/**
 * Empty state for when the "Matched" filter is selected but no matched albums exist.
 * This is informational only - doesn't prompt for scanning since albums exist, they just haven't been matched yet.
 */
function MatchedView() {
  return (
    <div className="flex-col py-12 justify-center text-center">
      <div className="mb-4">
        <Music className="w-16 h-16 mx-auto text-foreground/30" />
      </div>
      <h2 className="text-xl font-heading text-foreground mb-2">
        No matched albums yet
      </h2>
      <p className="text-foreground/60 mb-6">
        Albums appear here when they have been matched to external metadata
        sources like Redacted or MusicBrainz.
        <br />
        Browse your unmatched albums and use metadata search to match them.
      </p>
    </div>
  );
}

export default MatchedView;
