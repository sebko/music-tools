import { Link, useLocation } from "react-router-dom";
import { ThemeToggle, AppShell, NavLink } from "@dj-tools/my-component-library";

function Layout({ children }) {
  const location = useLocation();
  const isLibraryActive = location.pathname === "/" || location.pathname.startsWith("/albums");
  const isGenresActive = location.pathname === "/genres";
  const isSettingsActive = location.pathname === "/settings";

  return (
    <AppShell
      brandElement={
        <Link to="/" className="flex items-center space-x-2 group">
          <h1 className="text-xl font-heading text-foreground">
            Metadata Manager
          </h1>
        </Link>
      }
      navigation={
        <>
          <NavLink isActive={isLibraryActive} asChild>
            <Link to="/">Library</Link>
          </NavLink>
          <NavLink isActive={isGenresActive} asChild>
            <Link to="/genres">Genres</Link>
          </NavLink>
          <NavLink isActive={isSettingsActive} asChild>
            <Link to="/settings">Settings</Link>
          </NavLink>
        </>
      }
      actions={<ThemeToggle />}
    >
      {children}
    </AppShell>
  );
}

export default Layout;
