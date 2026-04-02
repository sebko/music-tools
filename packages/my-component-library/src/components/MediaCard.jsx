import { useState } from "react";
import { Music } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Composable card for any media item (album, single, playlist, etc.)
 * @param {Object} props
 * @param {string} [props.imageSrc] - URL for the artwork/image
 * @param {string} [props.imageAlt] - Alt text for the image
 * @param {React.ReactNode} [props.fallbackIcon] - Icon shown when no image
 * @param {string} props.title - Primary text line (truncated)
 * @param {string} [props.subtitle] - Secondary text line (truncated)
 * @param {React.ReactNode} [props.badges] - Badge overlay content (positioned absolutely within image area)
 * @param {React.ReactNode} [props.actions] - Hover action buttons overlay
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children] - Additional content below subtitle
 */
function MediaCard({
  imageSrc,
  imageAlt,
  fallbackIcon,
  title,
  subtitle,
  badges,
  actions,
  className,
  children,
}) {
  const [imgError, setImgError] = useState(false);
  const showImage = imageSrc && !imgError;

  return (
    <div
      className={cn(
        "card-brutalist group transition-all duration-200",
        "hover:shadow-main hover:border-main hover:-translate-x-1 hover:-translate-y-1",
        "active:shadow-none active:translate-x-0 active:translate-y-0",
        className
      )}
    >
      <div className="aspect-square relative overflow-hidden rounded-t-[3px]">
        {showImage ? (
          <img
            src={imageSrc}
            alt={imageAlt || title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-background-secondary flex items-center justify-center">
            {fallbackIcon || <Music className="w-12 h-12 text-foreground/20" />}
          </div>
        )}
        {badges}
        {actions && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {actions}
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-heading text-sm text-foreground truncate">{title}</h3>
        {subtitle && (
          <p className="text-xs text-foreground/60 truncate mt-0.5">{subtitle}</p>
        )}
        {children}
      </div>
    </div>
  );
}

export default MediaCard;
