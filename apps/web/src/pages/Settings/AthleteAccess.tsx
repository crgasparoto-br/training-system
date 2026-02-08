import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { athleteService, type Athlete } from '../../services/athlete.service';
import { useAuthStore } from '../../stores/useAuthStore';

export default function SettingsAthleteAccess() {
  const { user } = useAuthStore();
  const canAccess = user?.type === 'educator' && user.educator?.role === 'master';
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadAthletes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await athleteService.list(1, 100, undefined, 'all');
      setAthletes(data.athletes);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar atletas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) return;
    loadAthletes();
  }, [canAccess]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const trimmed = query.trim();
      if (trimmed) {
        const data = await athleteService.search(trimmed, undefined, 'all');
        setAthletes(data);
      } else {
        const data = await athleteService.list(1, 100, undefined, 'all');
        setAthletes(data.athletes);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao buscar atletas');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (athleteId: string) => {
    if (!confirm('Deseja gerar uma nova senha temporaria para este atleta?')) {
      return;
    }
    setResettingId(athleteId);
    setCopiedId(null);
    try {
      const result = await athleteService.resetPassword(athleteId);
      setTempPasswords((prev) => ({ ...prev, [athleteId]: result.tempPassword }));
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao resetar senha');
    } finally {
      setResettingId(null);
    }
  };

  const handleCopyPassword = async (athleteId: string) => {
    const password = tempPasswords[athleteId];
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopiedId(athleteId);
    } catch {
      alert('Nao foi possivel copiar a senha automaticamente');
    }
  };

  const visibleAthletes = useMemo(() => {
    return athletes.slice().sort((a, b) =>
      a.user.profile.name.localeCompare(b.user.profile.name)
    );
  }, [athletes]);

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acesso ao Cadastro de Alunos</h1>
          <p className="text-sm text-muted-foreground">
            Esta tela e restrita ao educador master.
          </p>
        </div>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Sem permissao para acessar este recurso.
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
            Tela temporaria para testes: reset de senha e acesso rapido ao cadastro.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAthletes}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Atualizar lista
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
            placeholder="Buscar atleta por nome"
            className="h-10 flex-1 min-w-[220px] rounded-lg border border-gray-300 px-3 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            Buscar
          </button>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              loadAthletes();
            }}
            className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Limpar
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2">Atleta</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2">Senha temporaria</th>
                <th className="px-3 py-2 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    Carregando...
                  </td>
                </tr>
              ) : visibleAthletes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    Nenhum atleta encontrado
                  </td>
                </tr>
              ) : (
                visibleAthletes.map((athlete) => (
                  <tr key={athlete.id} className="border-b">
                    <td className="px-3 py-2 text-gray-700">
                      <div className="font-medium">{athlete.user.profile.name}</div>
                      <div className="text-xs text-gray-500">
                        {athlete.educator?.user?.profile?.name || 'Educador'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{athlete.user.email}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          athlete.user.isActive === false
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {athlete.user.isActive === false ? 'Inativo' : 'Ativo'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {tempPasswords[athlete.id] ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">
                            {tempPasswords[athlete.id]}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyPassword(athlete.id)}
                            className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
                          >
                            {copiedId === athlete.id ? 'Copiado' : 'Copiar'}
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
                          to={`/athletes/${athlete.id}`}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Abrir cadastro
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(athlete.id)}
                          disabled={resettingId === athlete.id}
                          className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                        >
                          {resettingId === athlete.id ? 'Gerando...' : 'Gerar senha'}
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
