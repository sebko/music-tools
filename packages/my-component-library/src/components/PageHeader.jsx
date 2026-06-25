import { cn } from "../lib/utils";

/**
 * Page title section with optional subtitle and toolbar area
 * @param {Object} props
 * @param {string} props.title - Page heading
 * @param {React.ReactNode} [props.subtitle] - Summary text below title
 * @param {React.ReactNode} [props.children] - Toolbar/filter content below the heading
 * @param {string} [props.className]
 */
function PageHeader({ title, subtitle, children, className }) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="mb-4">
        <h1 className="text-2xl font-heading text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-foreground/60 mt-1">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export default PageHeader;
