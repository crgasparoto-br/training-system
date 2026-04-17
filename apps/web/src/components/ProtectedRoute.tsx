import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireProfessor?: boolean;
}

export function ProtectedRoute({ children, requireProfessor = false }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireProfessor && user?.type !== 'professor') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

