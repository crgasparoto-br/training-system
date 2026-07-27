// Reutiliza um cliente Prisma já existente no processo. A suíte completa do
// repositório carrega muitos módulos com clientes próprios; criar outro pool
// somente para a remediação da issue 274 pode exceder max_connections no CI.
// O cliente do catálogo é exportado, não possui estado de domínio e continua
// sendo usado exclusivamente como fronteira de acesso transacional ao banco.
export { serviceCatalogPrismaClient as issue274Prisma } from '../services/service.service-base.js';
