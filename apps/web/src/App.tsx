import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
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
          <Route path="athletes" element={<div className="text-center py-12">Página de Atletas (Em desenvolvimento)</div>} />
          <Route path="plans" element={<div className="text-center py-12">Página de Planos (Em desenvolvimento)</div>} />
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
