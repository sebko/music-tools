import { Link } from "react-router-dom";
import { ThemeToggle, AppShell } from "@dj-tools/my-component-library";
import LibraryToggle from "./LibraryToggle";
import ConnectivityBanner from "./ConnectivityBanner";
import ToolsMenu from "./ToolsMenu";

function Layout({ children }) {
  return (
    <AppShell
      brandElement={
        <Link to="/" className="flex items-center space-x-2 group">
          <h1 className="text-xl font-heading text-foreground">
            Music Manager
          </h1>
        </Link>
      }
      navigation={<ToolsMenu />}
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
