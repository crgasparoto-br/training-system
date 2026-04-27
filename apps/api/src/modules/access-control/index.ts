export { screenAccessMiddleware } from './access-control.middleware.js';
export {
  buildFullAccessPermissions,
  canProfessorAccessScreen,
  getEffectiveAccessPermissionsForProfessor,
  replaceAccessPermissionsForFunction,
  serializeAccessPermission,
  syncAccessPermissionsForContract,
  syncAccessPermissionsForFunction,
} from './access-control.service.js';
