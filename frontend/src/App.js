import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ManpowerList from "@/pages/ManpowerList";
import ManpowerProfile from "@/pages/ManpowerProfile";
import NewRegistration from "@/pages/NewRegistration";
import Renewals from "@/pages/Renewals";
import Documents from "@/pages/Documents";
import Reports from "@/pages/Reports";
import Users from "@/pages/Users";
import Settings from "@/pages/Settings";
import MasterData from "@/pages/MasterData";
import Contractors from "@/pages/Contractors";
import ContractorDetail from "@/pages/ContractorDetail";
import VendorEvaluations from "@/pages/VendorEvaluations";
import VendorEvaluationDetail from "@/pages/VendorEvaluationDetail";
import VendorEvaluationCompare from "@/pages/VendorEvaluationCompare";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/manpower" element={<ManpowerList />} />
            <Route path="/manpower/new" element={<NewRegistration />} />
            <Route path="/manpower/:id" element={<ManpowerProfile />} />
            <Route path="/renewals" element={<Renewals />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/reports" element={<Reports />} />
            <Route
              path="/contractors"
              element={
                <ProtectedRoute roles={["super_admin", "admin", "vendor_admin"]}>
                  <Contractors />
                </ProtectedRoute>
              }
            />
            <Route
              path="/contractors/:id"
              element={
                <ProtectedRoute roles={["super_admin", "admin", "vendor_admin"]}>
                  <ContractorDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vendor-evaluations"
              element={
                <ProtectedRoute roles={["super_admin", "admin", "vendor_admin"]}>
                  <VendorEvaluations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vendor-evaluations/compare"
              element={
                <ProtectedRoute roles={["super_admin", "admin", "vendor_admin"]}>
                  <VendorEvaluationCompare />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vendor-evaluations/:id"
              element={
                <ProtectedRoute roles={["super_admin", "admin", "vendor_admin"]}>
                  <VendorEvaluationDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute roles={["super_admin", "admin", "vendor_admin", "member"]}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/master-data"
              element={
                <ProtectedRoute roles={["super_admin", "admin"]}>
                  <MasterData />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute roles={["super_admin", "admin"]}>
                  <Settings />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}

export default App;
