import { ThemeToggle, AppShell } from "@music-tools/my-component-library";
import LibraryToggle from "./LibraryToggle";
import ConnectivityBanner from "./ConnectivityBanner";
import ToolsMenu from "./ToolsMenu";

function Layout({ children }) {
  return (
    <AppShell
      brandElement={
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-heading text-foreground">
            Metadata Manager
          </h1>
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
