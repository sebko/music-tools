import { Link, useLocation } from "react-router-dom";
import { ThemeToggle, AppShell, NavLink } from "@dj-tools/my-component-library";
import { Settings } from "lucide-react";
import LibraryToggle from "./LibraryToggle";
import ConnectivityBanner from "./ConnectivityBanner";

function Layout({ children }) {
  const location = useLocation();
  const isPlexCleanerActive = location.pathname === "/" || location.pathname.startsWith("/albums");
  const isFavouritesWizardActive = location.pathname === "/favourites-wizard";
  const isAlbumDeleterActive = location.pathname === "/album-deleter";
  const isSyncToFilesActive = location.pathname === "/sync-to-files";
  const isFilesToPlexActive = location.pathname === "/files-to-plex";
  const isSettingsActive = location.pathname === "/settings";

  return (
    <AppShell
      brandElement={
        <Link to="/" className="flex items-center space-x-2 group">
          <h1 className="text-xl font-heading text-foreground">
            Music Manager
          </h1>
        </Link>
      }
      navigation={
        <>
          <NavLink isActive={isPlexCleanerActive} asChild>
            <Link to="/">Plex Cleaner</Link>
          </NavLink>
          <NavLink isActive={isFavouritesWizardActive} asChild>
            <Link to="/favourites-wizard">Favourites Wizard</Link>
          </NavLink>
          <NavLink isActive={isAlbumDeleterActive} asChild>
            <Link to="/album-deleter">Album Deleter</Link>
          </NavLink>
          <NavLink isActive={isSyncToFilesActive} asChild>
            <Link to="/sync-to-files">Plex → Files</Link>
          </NavLink>
          <NavLink isActive={isFilesToPlexActive} asChild>
            <Link to="/files-to-plex">Files → Plex</Link>
          </NavLink>
          <NavLink isActive={isSettingsActive} asChild>
            <Link to="/settings">
              <Settings className="w-4 h-4" /> Settings
            </Link>
          </NavLink>
        </>
      }
      actions={
        <div className="flex items-center gap-2">
          <LibraryToggle />
          <ThemeToggle />
        </div>
      }
    >
      <ConnectivityBanner />
      {children}
    </AppShell>
  );
}

export default Layout;
