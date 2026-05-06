/**
 * Catálogo central de navegação do sistema.
 * Usado pelo menu lateral E pela árvore de permissões de funções.
 * Qualquer novo item adicionado aqui aparece automaticamente em ambos os locais.
 */
export { sidebarMenuItems as menuItems, permissionTreeGroups } from './sidebarMenu';
export type { PermissionTreeGroup, PermissionTreeRow } from './sidebarMenu';
