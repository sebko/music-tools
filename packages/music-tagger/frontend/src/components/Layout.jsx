import { Link, useLocation } from "react-router-dom";
import { ThemeToggle, cn } from "@dj-tools/my-component-library";
import { Settings } from "lucide-react";

function Layout({ children }) {
  const location = useLocation();
  const isPlexCleanerActive = location.pathname === "/" || location.pathname.startsWith("/albums");
  const isSyncToFilesActive = location.pathname === "/sync-to-files";
  const isFilesToPlexActive = location.pathname === "/files-to-plex";
  const isSettingsActive = location.pathname === "/settings";

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background-secondary border-b-2 border-border shadow-base mb-1">
        <div className="max-w-7xl 2xl:max-w-none mx-auto px-4 sm:px-6 lg:px-8 2xl:px-16">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center space-x-2 group">
              <h1 className="text-xl font-heading text-foreground">
                Music Manager
              </h1>
            </Link>
            <nav className="flex items-center space-x-4">
              <Link
                to="/"
                className={cn(
                  "px-4 py-2 rounded-base font-heading",
                  "border-2 border-border shadow-light",
                  "hover:shadow-base hover:-translate-x-0.5 hover:-translate-y-0.5",
                  "active:shadow-none active:translate-x-0 active:translate-y-0",
                  "transition-all duration-200 bg-background",
                  isPlexCleanerActive ? "text-main" : "text-foreground"
                )}
              >
                Plex Cleaner
              </Link>
              <Link
                to="/sync-to-files"
                className={cn(
                  "px-4 py-2 rounded-base font-heading",
                  "border-2 border-border shadow-light",
                  "hover:shadow-base hover:-translate-x-0.5 hover:-translate-y-0.5",
                  "active:shadow-none active:translate-x-0 active:translate-y-0",
                  "transition-all duration-200 bg-background",
                  isSyncToFilesActive ? "text-main" : "text-foreground"
                )}
              >
                Plex → Files
              </Link>
              <Link
                to="/files-to-plex"
                className={cn(
                  "px-4 py-2 rounded-base font-heading",
                  "border-2 border-border shadow-light",
                  "hover:shadow-base hover:-translate-x-0.5 hover:-translate-y-0.5",
                  "active:shadow-none active:translate-x-0 active:translate-y-0",
                  "transition-all duration-200 bg-background",
                  isFilesToPlexActive ? "text-main" : "text-foreground"
                )}
              >
                Files → Plex
              </Link>
              <Link
                to="/settings"
                className={cn(
                  "px-4 py-2 rounded-base font-heading",
                  "border-2 border-border shadow-light",
                  "hover:shadow-base hover:-translate-x-0.5 hover:-translate-y-0.5",
                  "active:shadow-none active:translate-x-0 active:translate-y-0",
                  "transition-all duration-200 bg-background",
                  "flex items-center gap-1.5",
                  isSettingsActive ? "text-main" : "text-foreground"
                )}
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl 2xl:max-w-none mx-auto py-6 px-4 sm:px-6 lg:px-8 2xl:px-16">
        {children}
      </main>
    </div>
  );
}

export default Layout;
