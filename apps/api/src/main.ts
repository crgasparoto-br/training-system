import './bootstrap-env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import { assessmentTypeRoutes } from './modules/assessments/index.js';
import { anthropometryRoutes } from './modules/anthropometry/index.js';
import { adipometryRoutes } from './modules/adipometry/index.js';
import adipometryGovernanceRoutes from './modules/adipometry/adipometry-governance.routes.js';
import { capacityPrescriptionRoutes } from './modules/capacity-prescriptions/index.js';
import { consolidatedPrescriptionRoutes } from './modules/consolidated-prescriptions/index.js';
import { prontuarioRoutes } from './modules/prontuario/index.js';
import { professorManualRoutes } from './modules/professor-manual/index.js';
import { authRoutes } from './modules/auth/index.js';
import alunoAvatarUploadRoutes from './modules/alunos/aluno-avatar-upload.routes.js';
import { alunoRoutes } from './modules/alunos/index.js';
import { bankRoutes } from './modules/banks/index.js';
import { collaboratorFunctionRoutes } from './modules/collaborator-functions/index.js';
import contractLifecycleRoutes from './modules/contracts/contract-lifecycle.routes.js';
import contractRejectionRoutes from './modules/contracts/contract-rejection.routes.js';
import { contractRoutes } from './modules/contracts/index.js';
import { hourlyRateLevelRoutes } from './modules/hourly-rate-levels/index.js';
import { notificationDeliveryWebhookRoutes } from './modules/notifications/notification-delivery.routes.js';
import { planRoutes } from './modules/plans/index.js';
import { professorRoutes } from './modules/professores/index.js';
import { legacyCollaboratorContractMiddleware } from './modules/professores/legacy-collaborator-contract.middleware.js';
import { serviceRoutes } from './modules/services/index.js';
import { startProfileReviewScheduler } from './modules/alunos/profile-review.scheduler.js';
import studentContractLifecycleRoutes from './modules/student-contracts/student-contract-lifecycle.routes.js';
import { preRegistrationAdminRoutes } from './modules/pre-registration-admin/index.js';
import { preRegistrationEnrollmentRoutes } from './modules/pre-registration-enrollment/index.js';
import {
  preRegistrationAuthenticatedRoutes,
  preRegistrationHealthIntakeRoutes,
  preRegistrationParqRoutes,
  preRegistrationPublicEntryRoutes,
} from './modules/pre-registration-public/index.js';
import {
  preRegistrationInviteAdminRoutes,
  preRegistrationInvitePublicErrorHandler,
  preRegistrationInvitePublicHeaders,
  preRegistrationInvitePublicRoutes,
} from './modules/pre-registration-invites/index.js';
import { startStudentContractLifecycleScheduler } from './modules/student-contracts/student-contract-lifecycle.scheduler.js';
import studentRoutes from './routes/student.routes.js';
import { getUploadStorageRoot } from './common/asset-storage.js';
import { createApiCorsOptions } from './common/api-cors.js';
import {
  createPreRegistrationHttpObservability,
  createPreRegistrationRolloutGate,
} from './common/pre-registration-rollout.js';
import {
  createPreRegistrationSafeBoundary,
  createPreRegistrationUnexpectedErrorHandler,
  installPreRegistrationSafeConsoleError,
} from './common/pre-registration-safe-log.js';
import { getJwtSecret, resolveCorsConfig } from './common/runtime-config.js';

const app: express.Express = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const preRegistrationRolloutGate = createPreRegistrationRolloutGate();
const preRegistrationSafeBoundary = createPreRegistrationSafeBoundary();

installPreRegistrationSafeConsoleError();
getJwtSecret(process.env);
app.set('trust proxy', 1);
const corsConfig = resolveCorsConfig(process.env);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Establish the sanitizing boundary before parsers, authentication, CORS and
// route-local handlers. This also protects legacy handlers that consume an
// unexpected exception instead of forwarding it to the global error handler.
app.use('/api/v1/pre-cadastro', preRegistrationSafeBoundary);
app.use('/api/v1/pre-registration-admin', preRegistrationSafeBoundary);
app.use('/api/v1/pre-registration', preRegistrationSafeBoundary);
app.use('/api/v1/alunos/:alunoId/pre-registration-invites', preRegistrationSafeBoundary);

app.use('/api/v1/pre-cadastro', preRegistrationInvitePublicHeaders);
app.use(
  '/api/v1/pre-cadastro',
  cors(createApiCorsOptions(corsConfig, { preflightContinue: true }))
);
app.use(
  '/api/v1/pre-cadastro',
  createPreRegistrationHttpObservability('public-invite'),
  preRegistrationRolloutGate
);

app.use('/api/v1', preRegistrationPublicEntryRoutes);
app.use('/api/v1', preRegistrationInvitePublicRoutes);
app.use('/api/v1/pre-cadastro', preRegistrationInvitePublicErrorHandler);

app.use(cors(createApiCorsOptions(corsConfig)));
app.use(
  '/api/v1/pre-registration-admin',
  createPreRegistrationHttpObservability('administrative-management'),
  preRegistrationRolloutGate
);
app.use(
  '/api/v1/pre-registration',
  createPreRegistrationHttpObservability('authenticated-onboarding'),
  preRegistrationRolloutGate
);
app.use(
  '/api/v1/alunos/:alunoId/pre-registration-invites',
  createPreRegistrationHttpObservability('administrative-invite'),
  preRegistrationRolloutGate
);

// Public, data-free runtime probe. The rollout gate above returns the canonical
// 503 envelope when disabled; an enabled API answers without invoking auth or DB.
app.get('/api/v1/pre-registration/availability', (_req, res) => {
  res.status(204).end();
});

// Provider callbacks need their own parsers so SendGrid signature verification
// receives the exact raw request body. Keep this mount before the global parsers.
app.use('/api/v1/notification-delivery', notificationDeliveryWebhookRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(getUploadStorageRoot(), {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));
app.use('/api/v1/uploads', express.static(getUploadStorageRoot(), {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), environment: NODE_ENV });
});

app.get('/api/v1', (_req, res) => {
  res.json({
    message: 'Sistema Acesso Saude e Performance API',
    version: '0.1.0',
    endpoints: {
      assessmentTypes: '/api/v1/assessment-types',
      auth: '/api/v1/auth',
      alunos: '/api/v1/alunos',
      anthropometry: '/api/v1/anthropometry',
      adipometry: '/api/v1/adipometry',
      capacityPrescriptions: '/api/v1/capacity-prescriptions',
      consolidatedPrescriptions: '/api/v1/consolidated-prescriptions',
      prontuario: '/api/v1/prontuario',
      professorManual: '/api/v1/professor-manual',
      banks: '/api/v1/banks',
      collaboratorFunctions: '/api/v1/collaborator-functions',
      contracts: '/api/v1/contracts',
      hourlyRateLevels: '/api/v1/hourly-rate-levels',
      plans: '/api/v1/plans',
      professores: '/api/v1/professores',
      services: '/api/v1/services',
      student: '/api/v1/student',
      preRegistrationAdmin: '/api/v1/pre-registration-admin/leads',
      preRegistrationEnrollmentReview: '/api/v1/pre-registration-admin/leads/:id/enrollment-review',
      preRegistrationInvites: '/api/v1/alunos/:alunoId/pre-registration-invites',
      preRegistrationInvitePublic: '/api/v1/pre-cadastro/:token',
      preRegistrationAvailability: '/api/v1/pre-registration/availability',
      preRegistrationAuthenticated: '/api/v1/pre-registration/session',
      preRegistrationParq: '/api/v1/pre-registration/processes/:alunoId/parq',
    },
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/assessment-types', assessmentTypeRoutes);

// A camada autoritativa intercepta create/update/review/convert antes das rotas
// administrativas legadas para impedir bypass por referências livres.
app.use('/api/v1/pre-registration-admin', preRegistrationEnrollmentRoutes);
app.use('/api/v1/pre-registration-admin', preRegistrationAdminRoutes);

app.use('/api/v1/pre-registration', preRegistrationAuthenticatedRoutes);
app.use('/api/v1/pre-registration', preRegistrationHealthIntakeRoutes);
app.use('/api/v1/pre-registration', preRegistrationParqRoutes);

app.use('/api/v1/alunos', alunoAvatarUploadRoutes);
app.use('/api/v1/alunos', studentContractLifecycleRoutes);
app.use('/api/v1/alunos', preRegistrationInviteAdminRoutes);
app.use('/api/v1/alunos', alunoRoutes);
app.use('/api/v1/anthropometry', anthropometryRoutes);
app.use('/api/v1/adipometry', adipometryRoutes);
app.use('/api/v1/capacity-prescriptions', capacityPrescriptionRoutes);
app.use('/api/v1/consolidated-prescriptions', consolidatedPrescriptionRoutes);
app.use('/api/v1/prontuario', prontuarioRoutes);
app.use('/api/v1/professor-manual', professorManualRoutes);
app.use('/api/v1/banks', bankRoutes);
app.use('/api/v1/collaborator-functions', collaboratorFunctionRoutes);
// Mount the authoritative ADPT governance routes before the legacy contract
// router so sensitive actions cannot fall back to role-based middleware.
app.use('/api/v1/contracts', adipometryGovernanceRoutes);
app.use('/api/v1/contracts', contractLifecycleRoutes);
app.use('/api/v1/contracts', contractRejectionRoutes);
app.use('/api/v1/contracts', contractRoutes);
app.use('/api/v1/hourly-rate-levels', hourlyRateLevelRoutes);
app.use('/api/v1/plans', planRoutes);
app.use('/api/v1/professores', legacyCollaboratorContractMiddleware);
app.use('/api/v1/professores', professorRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/student', studentRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(createPreRegistrationUnexpectedErrorHandler());

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  res.status(statusCode).json({
    error: message,
    ...(NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`
Sistema Acesso Saude e Performance API
Servidor iniciado com sucesso
URL: http://localhost:${PORT}
Health: http://localhost:${PORT}/health
API: http://localhost:${PORT}/api/v1
Auth: http://localhost:${PORT}/api/v1/auth
Environment: ${NODE_ENV}
  `);
});

startProfileReviewScheduler();
startStudentContractLifecycleScheduler();
