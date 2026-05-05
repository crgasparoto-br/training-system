export { screenAccessMiddleware } from './access-control.middleware.js';
export {
  buildProfessorDataScopeWhere,
  buildFullAccessPermissions,
  canAccessOwnData,
  canProfessorAccessScreen,
  getEffectiveAccessPermissionsForProfessor,
  getEffectiveDataScopeForProfessor,
  getMostPermissiveDataScopeForProfessor,
  replaceAccessPermissionsForFunction,
  serializeAccessPermission,
  syncAccessPermissionsForContract,
  syncAccessPermissionsForFunction,
} from './access-control.service.js';
