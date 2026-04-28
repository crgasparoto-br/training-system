import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { jiraService } from './jira.service.js';

const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);

const createIssueSchema = z.object({
  projectKey: z.string().min(2).optional(),
  summary: z.string().min(3, 'Resumo obrigatorio').max(255),
  description: z.string().max(20000).optional(),
  issueType: z.string().min(1, 'Tipo da issue obrigatorio'),
  priorityName: z.string().min(1).optional(),
  labels: z.array(z.string().min(1).max(255)).max(20).optional(),
  assigneeAccountId: z.string().min(1).optional(),
});

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const data = await jiraService.getStatus();
    return sendSuccess(res, data, 'Conexao com Jira validada');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao validar conexao com Jira', error.statusCode || 500);
  }
});

router.get('/metadata', async (req: Request, res: Response) => {
  try {
    const projectKey =
      typeof req.query.projectKey === 'string' && req.query.projectKey.trim()
        ? req.query.projectKey.trim()
        : undefined;

    const data = await jiraService.getProjectMetadata(projectKey);
    return sendSuccess(res, data, 'Metadados do Jira carregados');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao carregar metadados do Jira', error.statusCode || 500);
  }
});

router.get('/issues/:issueKey', async (req: Request, res: Response) => {
  try {
    const data = await jiraService.getIssue(req.params.issueKey);
    return sendSuccess(res, data, 'Issue carregada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao carregar issue do Jira', error.statusCode || 500);
  }
});

router.post('/issues', async (req: Request, res: Response) => {
  try {
    const payload = createIssueSchema.parse(req.body);
    const data = await jiraService.createIssue(payload);
    return sendSuccess(res, data, 'Issue criada com sucesso no Jira', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, `Dados inválidos: ${error.errors.map((item) => item.message).join(', ')}`, 400);
    }

    return sendError(res, error.message || 'Erro ao criar issue no Jira', error.statusCode || 500);
  }
});

export default router;
