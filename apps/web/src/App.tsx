import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import type { ReactElement } from 'react';
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
import SettingsServices from './pages/Settings/Services';
import SettingsSubjectiveScales from './pages/Settings/SubjectiveScales';
import SettingsAlunoAccess from './pages/Settings/AlunoAccess';
import SettingsBanks from './pages/Settings/Banks';
import SettingsProfessorManual from './pages/Settings/ProfessorManual';
import SettingsReferenceTable from './pages/Settings/ReferenceTable';
import Library from './pages/Library';
import PhysicalAssessmentProtocol from './pages/PhysicalAssessmentProtocol';
import WorkoutBuilder2 from './pages/WorkoutBuilder2';
import Executions from './pages/Executions';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

function withAccess(screenKey: string, element: ReactElement) {
  return <ProtectedRoute screenKey={screenKey}>{element}</ProtectedRoute>;
}

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
          <Route path="professores" element={withAccess('collaborators.registration', <Professores />)} />
          <Route path="alunos" element={withAccess('students.registration', <AlunoForm />)} />
          <Route path="alunos/new" element={withAccess('students.registration', <AlunoForm />)} />
          <Route path="alunos/:id" element={withAccess('students.registration', <AlunoDetails />)} />
          <Route path="alunos/:id/edit" element={withAccess('students.registration', <AlunoForm />)} />
          <Route
            path="protocolo-avaliacao-fisica"
            element={<Navigate to="/protocolo-avaliacao-fisica/antropometria" replace />}
          />
          <Route path="protocolo-avaliacao-fisica/antropometria" element={withAccess('physicalAssessment.protocol', <PhysicalAssessmentProtocol />)} />
          <Route
            path="protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento"
            element={withAccess('physicalAssessment.protocol', <PhysicalAssessmentProtocol />)}
          />
          <Route path="protocolo-avaliacao-fisica/adipometria" element={withAccess('physicalAssessment.protocol', <PhysicalAssessmentProtocol />)} />
          <Route path="protocolo-avaliacao-fisica/bioimpedanciometria" element={withAccess('physicalAssessment.protocol', <PhysicalAssessmentProtocol />)} />
          <Route path="protocolo-avaliacao-fisica/ultrassonografia" element={withAccess('physicalAssessment.protocol', <PhysicalAssessmentProtocol />)} />
          <Route path="consultas" element={<Navigate to="/consultas/alunos" replace />} />
          <Route path="consultas/alunos" element={withAccess('students.consultation', <Alunos />)} />
          <Route path="consultas/colaboradores" element={withAccess('collaborators.consultation', <Professores mode="consult" />)} />
          <Route path="plans" element={withAccess('plans', <Plans />)} />
          <Route path="plans/new" element={withAccess('plans', <PlanForm />)} />
          <Route path="plans/:id" element={withAccess('plans', <PlanDetails />)} />
          <Route path="plans/:id/edit" element={withAccess('plans', <PlanForm />)} />
          <Route path="agenda" element={withAccess('agenda', <Agenda />)} />
          <Route path="plans/:planId/workout-builder/:mesocycleNumber/:weekNumber" element={withAccess('plans', <WorkoutBuilder2 />)} />
          <Route path="library" element={withAccess('library', <Library />)} />
          <Route path="executions" element={withAccess('executions', <Executions />)} />
          <Route path="reports" element={withAccess('reports', <div className="text-center py-12">Página de Relatórios (Em desenvolvimento)</div>)} />
          <Route path="settings" element={withAccess('settings.home', <Settings />)} />
          <Route path="settings/parameters" element={withAccess('settings.parameters', <SettingsParameters />)} />
          <Route path="settings/contract" element={withAccess('settings.contract', <ContractSettings />)} />
          <Route path="settings/assessment-types" element={withAccess('settings.assessmentTypes', <SettingsAssessmentTypes />)} />
          <Route path="settings/services" element={withAccess('settings.services', <SettingsServices />)} />
          <Route path="settings/banks" element={withAccess('settings.banks', <SettingsBanks />)} />
          <Route path="settings/collaborator-functions" element={withAccess('settings.collaboratorFunctions', <SettingsCollaboratorFunctions />)} />
          <Route path="cadastros/valores-hora-aula" element={withAccess('hourlyRateLevels.registration', <SettingsHourlyRateLevels />)} />
          <Route path="settings/hourly-rate-levels" element={<Navigate to="/cadastros/valores-hora-aula" replace />} />
          <Route path="settings/psr-pse" element={withAccess('settings.subjectiveScales', <SettingsSubjectiveScales />)} />
          <Route path="settings/professor-manual" element={withAccess('settings.professorManual', <SettingsProfessorManual />)} />
          <Route path="settings/aluno-access" element={withAccess('settings.alunoAccess', <SettingsAlunoAccess />)} />
          <Route path="settings/reference-table" element={withAccess('settings.referenceTable', <SettingsReferenceTable />)} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/alunos" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

