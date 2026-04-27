import { Navigate } from 'react-router-dom';
import type { AccessScreenKey } from '@corrida/types';
import { canAccessScreen } from '../access/access-control';
import { useAuthStore } from '../stores/useAuthStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireProfessor?: boolean;
  screenKey?: AccessScreenKey | string;
}

function AccessDenied() {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
      <p className="text-lg font-semibold text-foreground">Acesso restrito</p>
      <p className="mt-2 text-sm">Seu perfil não tem permissão para visualizar esta tela.</p>
    </div>
  );
}

export function ProtectedRoute({ children, requireProfessor = false, screenKey }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireProfessor && user?.type !== 'professor') {
    return <Navigate to="/dashboard" replace />;
  }

  if (screenKey && !canAccessScreen(user, screenKey)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

