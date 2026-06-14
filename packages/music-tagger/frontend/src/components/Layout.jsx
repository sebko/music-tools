import { ThemeToggle, AppShell } from "@dj-tools/my-component-library";
import LibraryToggle from "./LibraryToggle";
import ConnectivityBanner from "./ConnectivityBanner";
import ToolsMenu from "./ToolsMenu";

function Layout({ children }) {
  return (
    <AppShell
      brandElement={<LibraryToggle />}
      navigation={<ToolsMenu />}
      actions={<ThemeToggle />}
    >
      <ConnectivityBanner />
      {children}
    </AppShell>
  );
}

export default Layout;
