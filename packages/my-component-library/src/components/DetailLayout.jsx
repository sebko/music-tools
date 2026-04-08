import { cn } from "../lib/utils";

/**
 * Sidebar (artwork) + content area layout for detail pages
 * Stacks vertically on mobile, side-by-side on md+
 * @param {Object} props
 * @param {React.ReactNode} props.sidebar - Left sidebar content (usually artwork)
 * @param {string} [props.sidebarWidth='w-full md:w-64'] - Sidebar width class
 * @param {React.ReactNode} props.children - Main content area
 * @param {React.ReactNode} [props.footer] - Full-width content below the sidebar+content row, inside the card
 * @param {string} [props.className]
 */
function DetailLayout({ sidebar, sidebarWidth = "w-full md:w-64", footer, children, className }) {
  return (
    <div className={cn("card-brutalist p-6", className)}>
      <div className="flex flex-col md:flex-row gap-6">
        <div className={cn("flex-shrink-0", sidebarWidth)}>
          {sidebar}
        </div>
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}

export default DetailLayout;
