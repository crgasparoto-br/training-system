import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '../stores/useAuthStore';

const studentUser = {
  id: 'student-1',
  email: 'student@example.com',
  name: 'Aluno',
  type: 'aluno' as const,
  mustChangePassword: true,
};

describe('ProtectedRoute temporary password gate', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: studentUser,
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('redireciona aluno com senha temporaria antes de renderizar rota normal', () => {
    render(
      <MemoryRouter initialEntries={['/inicio']}>
        <Routes>
          <Route path="/change-password" element={<div>Troca obrigatoria</div>} />
          <Route
            path="/inicio"
            element={
              <ProtectedRoute>
                <div>Conteudo privado</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Troca obrigatoria')).toBeInTheDocument();
    expect(screen.queryByText('Conteudo privado')).not.toBeInTheDocument();
  });

  it('libera rota normal depois que o estado obrigatorio foi limpo', () => {
    useAuthStore.setState({
      user: { ...studentUser, mustChangePassword: false },
    });

    render(
      <MemoryRouter initialEntries={['/inicio']}>
        <Routes>
          <Route path="/change-password" element={<div>Troca obrigatoria</div>} />
          <Route
            path="/inicio"
            element={
              <ProtectedRoute>
                <div>Conteudo privado</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Conteudo privado')).toBeInTheDocument();
    expect(screen.queryByText('Troca obrigatoria')).not.toBeInTheDocument();
  });
});
