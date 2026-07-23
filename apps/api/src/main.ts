import './bootstrap-env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import { assessmentTypeRoutes } from './modules/assessments/index.js';
import { anthropometryRoutes } from './modules/anthropometry/index.js';
import { prontuarioRoutes } from './modules/prontuario/index.js';
import { authRoutes } from './modules/auth/index.js';
import alunoAvatarUploadRoutes from './modules/alunos/aluno-avatar-upload.routes.js';
import { alunoRoutes } from './modules/alunos/index.js';
import { bankRoutes } from './modules/banks/index.js';
import { collaboratorFunctionRoutes } from './modules/collaborator-functions/index.js';
import contractLifecycleRoutes from './modules/contracts/contract-lifecycle.routes.js';
import contractRejectionRoutes from './modules/contracts/contract-rejection.routes.js';
import { contractRoutes } from './modules/contracts/index.js';
import { hourlyRateLevelRoutes } from './modules/hourly-rate-levels/index.js';
import { planRoutes } from './modules/plans/index.js';
import { professorRoutes } from './modules/professores/index.js';
import { legacyCollaboratorContractMiddleware } from './modules/professores/legacy-collaborator-contract.middleware.js';
import { serviceRoutes } from './modules/services/index.js';
import { startProfileReviewScheduler } from './modules/alunos/profile-review.scheduler.js';
import studentContractLifecycleRoutes from './modules/student-contracts/student-contract-lifecycle.routes.js';
import { preRegistrationAdminRoutes } from './modules/pre-registration-admin/index.js';
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
import { getJwtSecret, resolveCorsConfig } from './common/runtime-config.js';

const app: express.Express = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';

getJwtSecret(process.env);

app.set('trust proxy', 1);

const corsConfig = resolveCorsConfig(process.env);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// O namespace público recebe os headers de proteção antes de qualquer middleware
// que possa falhar. Assim, inclusive rejeições de CORS permanecem no-store e não
// enviam referrer contendo o token.
app.use('/api/v1/pre-cadastro', preRegistrationInvitePublicHeaders);

// Somente o namespace público mantém o preflight em fluxo para que OPTIONS
// também alcance o fallback seguro e o rate limit do domínio.
app.use(
  '/api/v1/pre-cadastro',
  cors(createApiCorsOptions(corsConfig, { preflightContinue: true }))
);

// O roteador público deve interceptar qualquer método ou variação tokenizada
// antes dos parsers globais. Assim, até payload inválido ou excessivo recebe a
// resposta genérica e o rate limit do domínio.
app.use('/api/v1', preRegistrationInvitePublicRoutes);

// Captura falhas ocorridas antes ou dentro do roteador público, incluindo CORS,
// sem registrar nem devolver detalhes que possam carregar o token.
app.use('/api/v1/pre-cadastro', preRegistrationInvitePublicErrorHandler);

// As demais rotas preservam o comportamento CORS anterior, inclusive o retorno
// automático de preflight, mas sem incorporar a origem rejeitada na mensagem.
app.use(cors(createApiCorsOptions(corsConfig)));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(getUploadStorageRoot(), {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));
app.use('/api/v1/uploads', express.static(getUploadStorageRoot(), {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// ============================================================================
// API ROUTES
// ============================================================================

app.get('/api/v1', (_req, res) => {
  res.json({
    message: 'Sistema Acesso Saude e Performance API',
    version: '0.1.0',
    endpoints: {
      assessmentTypes: '/api/v1/assessment-types',
      auth: '/api/v1/auth',
      alunos: '/api/v1/alunos',
      anthropometry: '/api/v1/anthropometry',
      prontuario: '/api/v1/prontuario',
      banks: '/api/v1/banks',
      collaboratorFunctions: '/api/v1/collaborator-functions',
      contracts: '/api/v1/contracts',
      hourlyRateLevels: '/api/v1/hourly-rate-levels',
      plans: '/api/v1/plans',
      professores: '/api/v1/professores',
      services: '/api/v1/services',
      student: '/api/v1/student',
      preRegistrationAdmin: '/api/v1/pre-registration-admin/leads',
      preRegistrationInvites: '/api/v1/alunos/:alunoId/pre-registration-invites',
      preRegistrationInvitePublic: '/api/v1/pre-cadastro/:token',
    },
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/assessment-types', assessmentTypeRoutes);
app.use('/api/v1/pre-registration-admin', preRegistrationAdminRoutes);

// Public student avatar upload must use external storage before the legacy module.
app.use('/api/v1/alunos', alunoAvatarUploadRoutes);
// Safe activation must intercept the legacy student route.
app.use('/api/v1/alunos', studentContractLifecycleRoutes);
app.use('/api/v1/alunos', preRegistrationInviteAdminRoutes);
app.use('/api/v1/alunos', alunoRoutes);

app.use('/api/v1/anthropometry', anthropometryRoutes);
app.use('/api/v1/prontuario', prontuarioRoutes);
app.use('/api/v1/banks', bankRoutes);
app.use('/api/v1/collaborator-functions', collaboratorFunctionRoutes);

// Contract lifecycle and rejection guards must run before the main contract module.
app.use('/api/v1/contracts', contractLifecycleRoutes);
app.use('/api/v1/contracts', contractRejectionRoutes);
app.use('/api/v1/contracts', contractRoutes);

app.use('/api/v1/hourly-rate-levels', hourlyRateLevelRoutes);
app.use('/api/v1/plans', planRoutes);

// Legacy collaborator contract fields remain readable for migration/history only.
app.use('/api/v1/professores', legacyCollaboratorContractMiddleware);
app.use('/api/v1/professores', professorRoutes);

app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/student', studentRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Não ecoar a URL recebida: caminhos podem conter tokens ou outras credenciais.
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ============================================================================
// START SERVER
// ============================================================================

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

export default app;
