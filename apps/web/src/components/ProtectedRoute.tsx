import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireEducator?: boolean;
}

export function ProtectedRoute({ children, requireEducator = false }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireEducator && user?.type !== 'educator') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
