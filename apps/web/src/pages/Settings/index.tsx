import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';

export default function Settings() {
  const { user } = useAuthStore();
  const canAccessAthleteSettings =
    user?.type === 'educator' && user?.educator?.role === 'master';
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configura&ccedil;&otilde;es</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie par&acirc;metros e prefer&ecirc;ncias do sistema.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to="/settings/contract"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">Contrato</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dados fiscais e identifica&ccedil;&atilde;o do contrato.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar contrato &rarr;
          </div>
        </Link>
        <Link
          to="/settings/parameters"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">Par&acirc;metros de Treino</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro, consulta e altera&ccedil;&atilde;o dos par&acirc;metros usados na periodiza&ccedil;&atilde;o.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar par&acirc;metros &rarr;
          </div>
        </Link>
        <Link
          to="/settings/assessment-types"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">Tipos de Avalia&ccedil;&atilde;o</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure os tipos e periodicidades das avalia&ccedil;&otilde;es f&iacute;sicas.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar avalia&ccedil;&otilde;es &rarr;
          </div>
        </Link>
        <Link
          to="/settings/psr-pse"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">PSR e PSE</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulte as escalas subjetivas usadas pelos atletas.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar escalas &rarr;
          </div>
        </Link>
        <Link
          to="/settings/reference-table"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">Tabela de Referencia</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro e manutencao da base de referencia com dados e imagens da planilha.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar tabela &rarr;
          </div>
        </Link>
        {canAccessAthleteSettings && (
          <Link
            to="/settings/athlete-access"
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-gray-900">Cadastro de Alunos (Testes)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Acesso tempor&aacute;rio para reset de senha e cadastro do aluno.
            </p>
            <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
              Acessar cadastro &rarr;
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
