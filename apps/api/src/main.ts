import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import dotenv from 'dotenv';
import { authRoutes } from './modules/auth/index.js';
import { athleteRoutes } from './modules/athletes/index.js';
import { planRoutes } from './modules/plans/index.js';
import { periodizationRoutes } from './modules/periodization/index.js';
import libraryRoutes from './routes/library.routes.js';

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Segurança
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
    message: 'Corrida Training System API',
    version: '0.1.0',
    endpoints: {
      auth: '/api/v1/auth',
      athletes: '/api/v1/athletes',
      plans: '/api/v1/plans',
      periodization: '/api/v1/periodization',
      library: '/api/v1/library',
      sessions: '/api/v1/sessions',
      executions: '/api/v1/executions',
    },
  });
});

// Rotas de Autenticação
app.use('/api/v1/auth', authRoutes);

// Rotas de Atletas
app.use('/api/v1/athletes', athleteRoutes);

// Rotas de Planos de Treino
app.use('/api/v1/plans', planRoutes);

// Rotas de Periodização
app.use('/api/v1/periodization', periodizationRoutes);

// Rotas de Biblioteca de Exercícios
app.use('/api/v1/library', libraryRoutes);

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
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🏃 Corrida Training System API                          ║
║   ✅ Servidor iniciado com sucesso                        ║
║                                                            ║
║   🌐 URL: http://localhost:${PORT}                        ║
║   📝 Health: http://localhost:${PORT}/health              ║
║   📚 API: http://localhost:${PORT}/api/v1                 ║
║   🔐 Auth: http://localhost:${PORT}/api/v1/auth           ║
║                                                            ║
║   🔧 Environment: ${NODE_ENV}                             ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
