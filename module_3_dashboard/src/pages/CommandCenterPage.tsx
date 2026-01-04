import { Routes, Route, Navigate } from "react-router-dom";
import { SiteLayout } from "../components/layout/SiteLayout";
import { LiveSignalingPage } from "./LiveSignalingPage";
import { OverviewPage } from "./OverviewPage";
import { OperationsPage } from "./OperationsPage";
import { AnalysisPage } from "./AnalysisPage";
import { OutputFramesPage } from "./OutputFramesPage";
import { UploadsPage } from "./UploadsPage";
import { PlaybooksPage } from "./PlaybooksPage";
import { ProtectedRoute } from "../components/ProtectedRoute";

export function CommandCenterPage() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Navigate to="/live" replace />} />

        {/* Publicly accessible pages (no auth required) */}
        <Route
          path="/live"
          element={
            <ProtectedRoute allowedWithoutAuth>
              <LiveSignalingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/uploads"
          element={
            <ProtectedRoute allowedWithoutAuth>
              <UploadsPage />
            </ProtectedRoute>
          }
        />

        {/* Protected pages (auth required) */}
        <Route
          path="/overview"
          element={
            <ProtectedRoute panelName="overview">
              <OverviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/operations"
          element={
            <ProtectedRoute panelName="operations">
              <OperationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analysis"
          element={
            <ProtectedRoute panelName="analysis">
              <AnalysisPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/outputs"
          element={
            <ProtectedRoute panelName="outputs">
              <OutputFramesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/playbooks"
          element={
            <ProtectedRoute panelName="playbooks">
              <PlaybooksPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/live" replace />} />
      </Route>
    </Routes>
  );
}
