import { ExternalLink } from "lucide-react";
import { getMetadataServiceUrl } from "../utils/metadataLinks";
import { cn } from "@music-tools/my-component-library";

/**
 * Reusable component for displaying external metadata service links
 * Shows either a clickable link (if URL mapping exists) or plain text
 *
 * @param {Object} props
 * @param {string} props.service - Metadata service name (e.g., "musicbrainz", "redacted")
 * @param {string} props.externalId - External ID in the service
 * @param {string} [props.className] - Additional CSS classes
 */
export function ExternalMetadataLink({ service, externalId, className }) {
  const url = getMetadataServiceUrl(service, externalId);

  // If no URL mapping exists, show plain text
  if (!url) {
    return (
      <span className={cn("font-mono text-xs", className)}>
        {externalId}
      </span>
    );
  }

  // Show clickable link with external icon
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs",
        "text-blue-600 dark:text-blue-400 hover:underline",
        "transition-colors",
        className
      )}
      title={`View on ${service}`}
    >
      {externalId}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export default ExternalMetadataLink;
