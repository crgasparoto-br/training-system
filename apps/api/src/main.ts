import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRoutes } from './modules/auth/index.js';
import { alunoRoutes } from './modules/alunos/index.js';
import { planRoutes } from './modules/plans/index.js';
import { periodizationRoutes } from './modules/periodization/index.js';
import { professorRoutes } from './modules/professores/index.js';
import { contractRoutes } from './modules/contracts/index.js';
import { agendaRoutes } from './modules/agenda/index.js';
import { assessmentTypeRoutes, subjectiveScaleRoutes } from './modules/assessments/index.js';
import { jiraRoutes } from './modules/jira/index.js';
import libraryRoutes from './routes/library.routes.js';
import workoutRoutes from './routes/workout.routes.js';
import executionsRoutes from './routes/executions.routes.js';

// Carregar variÃ¡veis de ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

for (const envPath of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(process.cwd(), '..', '..', '.env'),
  path.resolve(__dirname, '../../../.env'),
]) {
  dotenv.config({ path: envPath, override: false });
}

const app: express.Express = express();
const PORT = process.env.API_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// MIDDLEWARE
// ============================================================================

// SeguranÃ§a
app.use(helmet());

// CORS
app.use(cors({
  origin: [
    'http://localhost:5173',      // Frontend Web
    'http://localhost:8081',      // Mobile (Expo)
    'exp://localhost:8081',
  ],
  credentials: true,
}));

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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
      auth: '/api/v1/auth',
      alunos: '/api/v1/alunos',
      professores: '/api/v1/professores',
      contracts: '/api/v1/contracts',
      plans: '/api/v1/plans',
      periodization: '/api/v1/periodization',
      assessmentTypes: '/api/v1/assessment-types',
      subjectiveScales: '/api/v1/subjective-scales',
      agenda: '/api/v1/agenda',
      jira: '/api/v1/jira',
      library: '/api/v1/library',
      workout: '/api/v1/workout',
      sessions: '/api/v1/sessions',
      executions: '/api/v1/executions',
    },
  });
});

// Rotas de AutenticaÃ§Ã£o
app.use('/api/v1/auth', authRoutes);

// Rotas de Alunos
app.use('/api/v1/alunos', alunoRoutes);

// Rotas de Professores
app.use('/api/v1/professores', professorRoutes);

// Rotas de Contratos
app.use('/api/v1/contracts', contractRoutes);

// Rotas de Planos de Treino
app.use('/api/v1/plans', planRoutes);

// Rotas de PeriodizaÃ§Ã£o
app.use('/api/v1/periodization', periodizationRoutes);

// Rotas de Tipos de AvaliaÃƒÂ§ÃƒÂ£o
app.use('/api/v1/assessment-types', assessmentTypeRoutes);
app.use('/api/v1/subjective-scales', subjectiveScaleRoutes);
app.use('/api/v1/agenda', agendaRoutes);
app.use('/api/v1/jira', jiraRoutes);

// Rotas de Biblioteca de ExercÃ­cios
app.use('/api/v1/library', libraryRoutes);

// Rotas de Montagem de Treinos
app.use('/api/v1/workout', workoutRoutes);
app.use('/api/v1/executions', executionsRoutes);

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

