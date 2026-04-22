import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Professores } from './pages/Professores';
import { Alunos } from './pages/Alunos';
import { AlunoForm } from './pages/AlunoForm';
import { AlunoDetails } from './pages/AlunoDetails';
import { Plans } from './pages/Plans';
import { PlanForm } from './pages/PlanForm';
import { PlanDetails } from './pages/PlanDetails';
import { Agenda } from './pages/Agenda';
import Settings from './pages/Settings';
import SettingsParameters from './pages/Settings/Parameters';
import ContractSettings from './pages/Settings/Contract';
import SettingsAssessmentTypes from './pages/Settings/AssessmentTypes';
import SettingsCollaboratorFunctions from './pages/Settings/CollaboratorFunctions';
import SettingsHourlyRateLevels from './pages/Settings/HourlyRateLevels';
import SettingsSubjectiveScales from './pages/Settings/SubjectiveScales';
import SettingsAlunoAccess from './pages/Settings/AlunoAccess';
import SettingsProfessorManual from './pages/Settings/ProfessorManual';
import SettingsReferenceTable from './pages/Settings/ReferenceTable';
import Library from './pages/Library';
import PhysicalAssessmentProtocol from './pages/PhysicalAssessmentProtocol';
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
          <Route index element={<Navigate to="/alunos" replace />} />
          <Route path="professores" element={<Professores />} />
          <Route path="alunos" element={<Alunos />} />
          <Route path="alunos/new" element={<AlunoForm />} />
          <Route path="alunos/:id" element={<AlunoDetails />} />
          <Route path="alunos/:id/edit" element={<AlunoForm />} />
          <Route
            path="protocolo-avaliacao-fisica"
            element={<Navigate to="/protocolo-avaliacao-fisica/antropometria" replace />}
          />
          <Route path="protocolo-avaliacao-fisica/antropometria" element={<PhysicalAssessmentProtocol />} />
          <Route
            path="protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento"
            element={<PhysicalAssessmentProtocol />}
          />
          <Route path="protocolo-avaliacao-fisica/adipometria" element={<PhysicalAssessmentProtocol />} />
          <Route path="protocolo-avaliacao-fisica/bioimpedanciometria" element={<PhysicalAssessmentProtocol />} />
          <Route path="protocolo-avaliacao-fisica/ultrassonografia" element={<PhysicalAssessmentProtocol />} />
          <Route path="plans" element={<Plans />} />
          <Route path="plans/new" element={<PlanForm />} />
          <Route path="plans/:id" element={<PlanDetails />} />
          <Route path="plans/:id/edit" element={<PlanForm />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="plans/:planId/workout-builder/:mesocycleNumber/:weekNumber" element={<WorkoutBuilder2 />} />
          <Route path="library" element={<Library />} />
          <Route path="executions" element={<Executions />} />
          <Route path="reports" element={<div className="text-center py-12">Página de Relatórios (Em desenvolvimento)</div>} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/parameters" element={<SettingsParameters />} />
          <Route path="settings/contract" element={<ContractSettings />} />
          <Route path="settings/assessment-types" element={<SettingsAssessmentTypes />} />
          <Route path="settings/collaborator-functions" element={<SettingsCollaboratorFunctions />} />
          <Route path="settings/hourly-rate-levels" element={<SettingsHourlyRateLevels />} />
          <Route path="settings/psr-pse" element={<SettingsSubjectiveScales />} />
          <Route path="settings/professor-manual" element={<SettingsProfessorManual />} />
          <Route path="settings/aluno-access" element={<SettingsAlunoAccess />} />
          <Route path="settings/reference-table" element={<SettingsReferenceTable />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/alunos" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

