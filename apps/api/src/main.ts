import './bootstrap-env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import path from 'path';
import { assessmentTypeRoutes } from './modules/assessments/index.js';
import { authRoutes } from './modules/auth/index.js';
import { alunoRoutes } from './modules/alunos/index.js';
import { bankRoutes } from './modules/banks/index.js';
import { collaboratorFunctionRoutes } from './modules/collaborator-functions/index.js';
import { hourlyRateLevelRoutes } from './modules/hourly-rate-levels/index.js';
import { planRoutes } from './modules/plans/index.js';
import { professorRoutes } from './modules/professores/index.js';
import { serviceRoutes } from './modules/services/index.js';

const app: express.Express = express();
const PORT = process.env.API_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

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

// ============================================================================
// MIDDLEWARE
// ============================================================================

// SeguranÃ§a
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

      if (allowedOrigins.includes(origin)) {
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
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

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
    message: 'Sistema Acesso Saúde e Performance API',
    version: '0.1.0',
    endpoints: {
      assessmentTypes: '/api/v1/assessment-types',
      auth: '/api/v1/auth',
      alunos: '/api/v1/alunos',
      banks: '/api/v1/banks',
      collaboratorFunctions: '/api/v1/collaborator-functions',
      hourlyRateLevels: '/api/v1/hourly-rate-levels',
      plans: '/api/v1/plans',
      professores: '/api/v1/professores',
      services: '/api/v1/services',
    },
  });
});

// Rotas de Autenticação
app.use('/api/v1/auth', authRoutes);

// Rotas de Tipos de Avaliação
app.use('/api/v1/assessment-types', assessmentTypeRoutes);

// Rotas de Alunos
app.use('/api/v1/alunos', alunoRoutes);

// Rotas de Bancos
app.use('/api/v1/banks', bankRoutes);

// Rotas de Funções de Colaboradores
app.use('/api/v1/collaborator-functions', collaboratorFunctionRoutes);

// Rotas de Níveis de Valor/Hora
app.use('/api/v1/hourly-rate-levels', hourlyRateLevelRoutes);

// Rotas de Planos
app.use('/api/v1/plans', planRoutes);

// Rotas de Professores
app.use('/api/v1/professores', professorRoutes);

// Rotas de Serviços
app.use('/api/v1/services', serviceRoutes);

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
â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘                                                            â•‘
â•‘   ðŸƒ Sistema Acesso Saúde e Performance API      â•‘
â•‘   âœ… Servidor iniciado com sucesso                        â•‘
â•‘                                                            â•‘
â•‘   ðŸŒ URL: http://localhost:${PORT}                        â•‘
â•‘   ðŸ“ Health: http://localhost:${PORT}/health              â•‘
â•‘   ðŸ“š API: http://localhost:${PORT}/api/v1                 â•‘
â•‘   ðŸ” Auth: http://localhost:${PORT}/api/v1/auth           â•‘
â•‘                                                            â•‘
â•‘   ðŸ”§ Environment: ${NODE_ENV}                             â•‘
â•‘                                                            â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  `);
});

export default app;

