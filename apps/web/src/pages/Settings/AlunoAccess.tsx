import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { alunoService, type Aluno } from '../../services/aluno.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { commonCopy } from '../../i18n/ptBR';

export default function SettingsAlunoAccess() {
  const { user } = useAuthStore();
  const canAccess = user?.type === 'professor' && user.professor?.role === 'master';
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadAlunos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await alunoService.list(1, 100, undefined, 'all');
      setAlunos(data.alunos);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar alunos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) return;
    loadAlunos();
  }, [canAccess]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const trimmed = query.trim();
      if (trimmed) {
        const data = await alunoService.search(trimmed, undefined, 'all');
        setAlunos(data);
      } else {
        const data = await alunoService.list(1, 100, undefined, 'all');
        setAlunos(data.alunos);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao buscar alunos');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (alunoId: string) => {
    if (!confirm('Deseja gerar uma nova senha temporária para este aluno?')) {
      return;
    }
    setResettingId(alunoId);
    setCopiedId(null);
    try {
      const result = await alunoService.resetPassword(alunoId);
      setTempPasswords((prev) => ({ ...prev, [alunoId]: result.tempPassword }));
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao resetar senha');
    } finally {
      setResettingId(null);
    }
  };

  const handleCopyPassword = async (alunoId: string) => {
    const password = tempPasswords[alunoId];
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopiedId(alunoId);
    } catch {
      alert('Não foi possível copiar a senha automaticamente');
    }
  };

  const visibleAlunos = useMemo(() => {
    return alunos.slice().sort((a, b) =>
      a.user.profile.name.localeCompare(b.user.profile.name)
    );
  }, [alunos]);

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acesso ao Cadastro de Alunos</h1>
          <p className="text-sm text-muted-foreground">
            Esta tela é restrita ao professor master.
          </p>
        </div>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          {commonCopy.noPermission}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acesso ao Cadastro de Alunos</h1>
          <p className="text-sm text-muted-foreground">
            Tela temporária para testes: reset de senha e acesso rápido ao cadastro.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAlunos}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {commonCopy.updateList}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar aluno por nome"
            className="h-10 flex-1 min-w-[220px] rounded-lg border border-gray-300 px-3 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            {commonCopy.search}
          </button>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              loadAlunos();
            }}
            className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {commonCopy.clear}
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2">Aluno</th>
                <th className="px-3 py-2">{commonCopy.emailLabel}</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2">Senha temporária</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    Carregando...
                  </td>
                </tr>
              ) : visibleAlunos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    Nenhum aluno encontrado
                  </td>
                </tr>
              ) : (
                visibleAlunos.map((aluno) => (
                  <tr key={aluno.id} className="border-b">
                    <td className="px-3 py-2 text-gray-700">
                      <div className="font-medium">{aluno.user.profile.name}</div>
                      <div className="text-xs text-gray-500">
                        {aluno.professor?.user?.profile?.name || 'Professor'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{aluno.user.email}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          aluno.user.isActive === false
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {aluno.user.isActive === false ? 'Inativo' : 'Ativo'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {tempPasswords[aluno.id] ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">
                            {tempPasswords[aluno.id]}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyPassword(aluno.id)}
                            className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
                          >
                            {copiedId === aluno.id ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Gere uma nova senha
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/alunos/${aluno.id}`}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Abrir cadastro
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(aluno.id)}
                          disabled={resettingId === aluno.id}
                          className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                        >
                          {resettingId === aluno.id ? 'Gerando...' : 'Gerar senha'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

