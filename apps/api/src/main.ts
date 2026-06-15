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
import { contractRoutes } from './modules/contracts/index.js';
import { hourlyRateLevelRoutes } from './modules/hourly-rate-levels/index.js';
import { planRoutes } from './modules/plans/index.js';
import { professorRoutes } from './modules/professores/index.js';
import { serviceRoutes } from './modules/services/index.js';
import { startProfileReviewScheduler } from './modules/alunos/profile-review.scheduler.js';
import studentRoutes from './routes/student.routes.js';
import { getUploadStorageRoot } from './common/asset-storage.js';

const app: express.Express = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';

app.set('trust proxy', 1);

function parseCorsOrigins(value?: string) {
  return (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const allowedOrigins = Array.from(
  new Set([
    ...parseCorsOrigins(process.env.CORS_ORIGINS),
    process.env.FRONTEND_URL,
    process.env.MOBILE_URL,
    'http://localhost:5173',
    'http://localhost:8081',
    'exp://localhost:8081',
  ].filter(Boolean) as string[])
);

const allowedVercelPreviewProjects = new Set([
  'training-system-web',
  ...parseCorsOrigins(process.env.CORS_VERCEL_PREVIEW_PROJECTS),
]);

function isAllowedVercelPreviewOrigin(origin: string) {
  let hostname: string;

  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (!hostname.endsWith('.vercel.app')) {
    return false;
  }

  return Array.from(allowedVercelPreviewProjects).some((project) =>
    project && hostname.startsWith(`${project}-`)
  );
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Seguranca
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Requests server-to-server or via curl/healthchecks may not send Origin.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin) || isAllowedVercelPreviewOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(getUploadStorageRoot()));
app.use('/api/v1/uploads', express.static(getUploadStorageRoot()));

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// ============================================================================
// API ROUTES
// ============================================================================

app.get('/api/v1', (req, res) => {
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
    },
  });
});

// Rotas de Autenticacao
app.use('/api/v1/auth', authRoutes);

// Rotas de Tipos de Avaliacao
app.use('/api/v1/assessment-types', assessmentTypeRoutes);

// Upload publico de avatar de aluno deve usar storage externo antes do modulo legado.
app.use('/api/v1/alunos', alunoAvatarUploadRoutes);

// Rotas de Alunos
app.use('/api/v1/alunos', alunoRoutes);

// Rotas de Avaliacao Antropometrica
app.use('/api/v1/anthropometry', anthropometryRoutes);

// Rotas do PRNT
app.use('/api/v1/prontuario', prontuarioRoutes);

// Rotas de Bancos
app.use('/api/v1/banks', bankRoutes);

// Rotas de Funcoes de Colaboradores
app.use('/api/v1/collaborator-functions', collaboratorFunctionRoutes);

// Rotas de Contratos
app.use('/api/v1/contracts', contractRoutes);

// Rotas de Niveis de Valor/Hora
app.use('/api/v1/hourly-rate-levels', hourlyRateLevelRoutes);

// Rotas de Planos
app.use('/api/v1/plans', planRoutes);

// Rotas de Professores
app.use('/api/v1/professores', professorRoutes);

// Rotas de Servicos
app.use('/api/v1/services', serviceRoutes);

// Rotas do aluno autenticado
app.use('/api/v1/student', studentRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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

export default app;