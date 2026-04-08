import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@dj-tools/my-component-library";
import Layout from "./components/Layout";
import AlbumsPage from "./pages/AlbumsPage";
import AlbumDetailPage from "./pages/AlbumDetailPage";
import GenresPage from "./pages/GenresPage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<AlbumsPage />} />
            <Route path="/albums/:name" element={<AlbumDetailPage />} />
            <Route path="/genres" element={<GenresPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;
