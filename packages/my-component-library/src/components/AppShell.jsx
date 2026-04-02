import { cn } from "../lib/utils";

/**
 * Top nav header + main content layout shell
 * Router-agnostic — pass navigation items as composed NavLinks
 * @param {Object} props
 * @param {string} [props.brandName='App'] - Brand text in header
 * @param {React.ReactNode} [props.brandElement] - Custom brand element (overrides brandName)
 * @param {React.ReactNode} [props.navigation] - Nav links content
 * @param {React.ReactNode} [props.actions] - Right-side header actions (theme toggle, etc.)
 * @param {string} [props.maxWidth='max-w-7xl 2xl:max-w-none'] - Content max width class
 * @param {React.ReactNode} props.children - Main content
 * @param {string} [props.className]
 */
function AppShell({
  brandName = "App",
  brandElement,
  navigation,
  actions,
  maxWidth = "max-w-7xl 2xl:max-w-none",
  children,
  className,
}) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <header className="bg-background-secondary border-b-2 border-border shadow-base mb-1">
        <div className={cn("mx-auto px-4 sm:px-6 lg:px-8 2xl:px-16", maxWidth)}>
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              {brandElement || (
                <h1 className="text-xl font-heading text-foreground">{brandName}</h1>
              )}
              {navigation && (
                <nav className="flex items-center gap-2">
                  {navigation}
                </nav>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-3">
                {actions}
              </div>
            )}
          </div>
        </div>
      </header>
      <main className={cn("mx-auto py-6 px-4 sm:px-6 lg:px-8 2xl:px-16", maxWidth)}>
        {children}
      </main>
    </div>
  );
}

export default AppShell;
