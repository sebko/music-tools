import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@music-tools/my-component-library";
import { useHueRotation } from "./hooks/useHueRotation";
import { LibraryProvider } from "./contexts/LibraryContext.jsx";
import Layout from "./components/Layout";
import AppErrorBoundary from "./components/AppErrorBoundary";
import AlbumsPage from "./pages/AlbumsPage";
import AlbumDetailPage from "./pages/AlbumDetailPage";
import AlbumMetadataSearchPage from "./pages/AlbumMetadataSearchPage";
import MatchMetadataPage from "./pages/MatchMetadataPage";
import SyncMetadataPage from "./pages/SyncMetadataPage";
import SyncedAlbumPage from "./pages/SyncedAlbumPage";
import SyncToFilesPage from "./pages/SyncToFilesPage";
import SyncToFilesDetailPage from "./pages/SyncToFilesDetailPage";
import SyncFailuresPage from "./pages/SyncFailuresPage";
import FilesToPlexPage from "./pages/FilesToPlexPage";
import FavouritesWizardPage from "./pages/FavouritesWizardPage";
import AlbumDeleterPage from "./pages/AlbumDeleterPage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  // Start the quirky hue rotation animation
  useHueRotation();

  return (
    <ThemeProvider>
      <Router>
        <LibraryProvider>
        <Layout>
          <AppErrorBoundary>
          <Routes>
            <Route path="/" element={<AlbumsPage />} />
            <Route path="/albums/:id" element={<AlbumDetailPage />} />
            <Route path="/albums/:id/metadata-search" element={<AlbumMetadataSearchPage />} />
            <Route path="/albums/:id/match/:groupId" element={<MatchMetadataPage />} />
            <Route path="/albums/:id/sync/:groupId" element={<SyncMetadataPage />} />
            <Route path="/albums/:id/synced/:groupId" element={<SyncedAlbumPage />} />
            <Route path="/sync-to-files" element={<SyncToFilesPage />} />
            <Route path="/sync-to-files/:id" element={<SyncToFilesDetailPage />} />
            <Route path="/sync-failures" element={<SyncFailuresPage />} />
            <Route path="/files-to-plex" element={<FilesToPlexPage />} />
            <Route path="/favourites-wizard" element={<FavouritesWizardPage />} />
            <Route path="/album-deleter" element={<AlbumDeleterPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          </AppErrorBoundary>
        </Layout>
        </LibraryProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
