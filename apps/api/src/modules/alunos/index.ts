import { Router } from 'express';
import legacyAlunoRoutes from './aluno.routes.js';
import segmentedAlunoRoutes from './student-domain.routes.js';

const alunoRoutes: Router = Router();

alunoRoutes.use(segmentedAlunoRoutes);
alunoRoutes.use(legacyAlunoRoutes);

export default alunoRoutes;
export { alunoRoutes };
export { alunoService } from './aluno.service.js';
export { studentDomainService } from './student-domain.service.js';
