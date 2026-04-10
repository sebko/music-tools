import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@dj-tools/my-component-library";
import Layout from "./components/Layout";
import SetupGate from "./components/SetupGate";
import AlbumsPage from "./pages/AlbumsPage";
import AlbumDetailPage from "./pages/AlbumDetailPage";
import GenresPage from "./pages/GenresPage";
import SettingsPage from "./pages/SettingsPage";
import SetupWizard from "./pages/SetupWizard";

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Routes>
            <Route
              path="/"
              element={
                <SetupGate>
                  <AlbumsPage />
                </SetupGate>
              }
            />
            <Route path="/albums/:name" element={<AlbumDetailPage />} />
            <Route path="/genres" element={<GenresPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/setup" element={<SetupWizard />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;
