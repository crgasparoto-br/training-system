import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';

export default function Settings() {
  const { user } = useAuthStore();
  const canAccessAlunoSettings =
    user?.type === 'professor' && user?.professor?.role === 'master';
  const canManageCollaboratorFunctions =
    user?.type === 'professor' &&
    user?.professor?.role === 'master' &&
    user?.professor?.contract?.type === 'academy';
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
        {canAccessAlunoSettings && (
          <Link
            to="/settings/services"
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-gray-900">Serviços</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastro dos serviços exibidos no campo Serviço de Interesse do aluno.
            </p>
            <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
              Acessar serviços &rarr;
            </div>
          </Link>
        )}
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
        {canManageCollaboratorFunctions && (
          <Link
            to="/settings/banks"
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-gray-900">Bancos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sincronize manualmente a base local de bancos usada no bloco de dados jur&iacute;dicos do colaborador.
            </p>
            <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
              Acessar bancos &rarr;
            </div>
          </Link>
        )}
        {canManageCollaboratorFunctions && (
          <Link
            to="/settings/collaborator-functions"
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-gray-900">Fun&ccedil;&otilde;es de Colaboradores</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastro das fun&ccedil;&otilde;es exibidas no campo Fun&ccedil;&atilde;o do colaborador.
            </p>
            <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
              Acessar fun&ccedil;&otilde;es &rarr;
            </div>
          </Link>
        )}
        <Link
          to="/settings/psr-pse"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">PSR e PSE</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulte as escalas subjetivas usadas pelos alunos.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar escalas &rarr;
          </div>
        </Link>
        <Link
          to="/settings/professor-manual"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">Manual do Professor</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro do conteúdo institucional e contextual usado nos fluxos de avaliação e treino.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar manual &rarr;
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
        {canAccessAlunoSettings && (
          <Link
            to="/settings/aluno-access"
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

