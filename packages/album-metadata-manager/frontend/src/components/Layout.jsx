import { Link } from "react-router-dom";
import { ThemeToggle, AppShell } from "@music-tools/my-component-library";
import LibraryToggle from "./LibraryToggle";
import ConnectivityBanner from "./ConnectivityBanner";
import ToolsMenu from "./ToolsMenu";

function Layout({ children }) {
  return (
    <AppShell
      brandElement={
        <div className="flex items-center gap-6">
          <Link
            to="/"
            aria-label="Metadata Manager — go to home"
            className="rounded-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <h1 className="text-xl font-heading text-foreground">
              Metadata Manager
            </h1>
          </Link>
          <LibraryToggle />
        </div>
      }
      navigation={<ToolsMenu />}
      actions={<ThemeToggle />}
    >
      <ConnectivityBanner />
      {children}
    </AppShell>
  );
}

export default Layout;
