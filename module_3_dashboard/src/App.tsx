import { Navigate, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./components/layout/SiteLayout";
import { OverviewPage } from "./pages/OverviewPage";
import { OperationsPage } from "./pages/OperationsPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { OutputFramesPage } from "./pages/OutputFramesPage";
import { UploadsPage } from "./pages/UploadsPage";
import { PlaybooksPage } from "./pages/PlaybooksPage";

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="operations" element={<OperationsPage />} />
        <Route path="analysis" element={<AnalysisPage />} />
        <Route path="outputs" element={<OutputFramesPage />} />
        <Route path="uploads" element={<UploadsPage />} />
        <Route path="playbooks" element={<PlaybooksPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}
