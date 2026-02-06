import { Link } from 'react-router-dom';

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie parâmetros e preferências do sistema.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to="/settings/contract"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">Contrato</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dados fiscais e identificaÃ§Ã£o do contrato.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar contrato â†’
          </div>
        </Link>
        <Link
          to="/settings/parameters"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">Parâmetros de Treino</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro, consulta e alteração dos parâmetros usados na periodização.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar parâmetros →
          </div>
        </Link>
        <Link
          to="/settings/assessment-types"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">Tipos de Avaliação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure os tipos e periodicidades das avaliações físicas.
          </p>
          <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
            Acessar avaliações â†’
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
            Acessar escalas →
          </div>
        </Link>
      </div>
    </div>
  );
}
