import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Educators } from './pages/Educators';
import { Athletes } from './pages/Athletes';
import { AthleteForm } from './pages/AthleteForm';
import { AthleteDetails } from './pages/AthleteDetails';
import { Plans } from './pages/Plans';
import { PlanForm } from './pages/PlanForm';
import { PlanDetails } from './pages/PlanDetails';
import Settings from './pages/Settings';
import SettingsParameters from './pages/Settings/Parameters';
import ContractSettings from './pages/Settings/Contract';
import SettingsAssessmentTypes from './pages/Settings/AssessmentTypes';
import SettingsSubjectiveScales from './pages/Settings/SubjectiveScales';
import SettingsAthleteAccess from './pages/Settings/AthleteAccess';
import Library from './pages/Library';
import WorkoutBuilder2 from './pages/WorkoutBuilder2';
import Executions from './pages/Executions';
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
          <Route path="educators" element={<Educators />} />
          <Route path="athletes" element={<Athletes />} />
          <Route path="athletes/new" element={<AthleteForm />} />
          <Route path="athletes/:id" element={<AthleteDetails />} />
          <Route path="athletes/:id/edit" element={<AthleteForm />} />
          <Route path="plans" element={<Plans />} />
          <Route path="plans/new" element={<PlanForm />} />
          <Route path="plans/:id" element={<PlanDetails />} />
          <Route path="plans/:id/edit" element={<PlanForm />} />
          <Route path="plans/:planId/workout-builder/:mesocycleNumber/:weekNumber" element={<WorkoutBuilder2 />} />
          <Route path="library" element={<Library />} />
          <Route path="executions" element={<Executions />} />
          <Route path="reports" element={<div className="text-center py-12">Página de Relatórios (Em desenvolvimento)</div>} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/parameters" element={<SettingsParameters />} />
          <Route path="settings/contract" element={<ContractSettings />} />
          <Route path="settings/assessment-types" element={<SettingsAssessmentTypes />} />
          <Route path="settings/psr-pse" element={<SettingsSubjectiveScales />} />
          <Route path="settings/athlete-access" element={<SettingsAthleteAccess />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
