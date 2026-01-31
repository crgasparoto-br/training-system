import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Athletes } from './pages/Athletes';
import { AthleteForm } from './pages/AthleteForm';
import { AthleteDetails } from './pages/AthleteDetails';
import { Plans } from './pages/Plans';
import { PlanForm } from './pages/PlanForm';
import { PlanDetails } from './pages/PlanDetails';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="athletes" element={<Athletes />} />
          <Route path="athletes/new" element={<AthleteForm />} />
          <Route path="athletes/:id" element={<AthleteDetails />} />
          <Route path="athletes/:id/edit" element={<AthleteForm />} />
          <Route path="plans" element={<Plans />} />
          <Route path="plans/new" element={<PlanForm />} />
          <Route path="plans/:id" element={<PlanDetails />} />
          <Route path="executions" element={<div className="text-center py-12">Página de Execuções (Em desenvolvimento)</div>} />
          <Route path="reports" element={<div className="text-center py-12">Página de Relatórios (Em desenvolvimento)</div>} />
          <Route path="settings" element={<div className="text-center py-12">Página de Configurações (Em desenvolvimento)</div>} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
