import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Professores } from './pages/Professores';
import { Alunos } from './pages/Alunos';
import { AlunoForm } from './pages/AlunoForm';
import { AlunoDetails } from './pages/AlunoDetails';
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
          <Route index element={<Navigate to="/alunos" replace />} />
          <Route path="professores" element={<Professores />} />
          <Route path="alunos" element={<Alunos />} />
          <Route path="alunos/new" element={<AlunoForm />} />
          <Route path="alunos/:id" element={<AlunoDetails />} />
          <Route path="alunos/:id/edit" element={<AlunoForm />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/alunos" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

