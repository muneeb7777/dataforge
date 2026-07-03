import { Navigate, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import DatasetsPage from "./pages/DatasetsPage";
import DatasetDetailPage from "./pages/DatasetDetailPage";
import ExplorePage from "./pages/ExplorePage";
import StudioPage from "./pages/StudioPage";
import ChartsPage from "./pages/ChartsPage";
import StatsPage from "./pages/StatsPage";
import ExportsPage from "./pages/ExportsPage";
import LoginPage from "./pages/LoginPage";
import { useAuth } from "./lib/auth";

function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <h1 className="text-4xl font-bold tracking-tight">DataForge</h1>
      <p className="text-slate-400">Data engineering &amp; analytics platform</p>
      <p className="text-sm text-slate-500">Start by uploading a dataset in the Datasets tab.</p>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/datasets/:id" element={<DatasetDetailPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/exports" element={<ExportsPage />} />
      </Route>
    </Routes>
  );
}
