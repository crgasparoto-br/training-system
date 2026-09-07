import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { CollaboratorFormPage } from './CollaboratorFormPage';

const settingsLinkClassName =
  'inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90';
const backLinkClassName =
  'inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent';

export function CollaboratorCreateRoute() {
  const { user } = useAuthStore();
  const contractType = user?.professor?.contract?.type;

  if (contractType === 'personal') {
    return (
      <div
        role="alert"
        className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold">Cadastro de colaboradores requer pessoa jurídica</h1>
          <p className="mt-2 text-sm leading-6">
            Este contrato está configurado como Pessoa física (CPF). O cadastro de colaboradores é
            uma função do contrato Pessoa jurídica (CNPJ). Altere o tipo do contrato e informe um
            CNPJ válido antes de continuar.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className={settingsLinkClassName} to="/settings/contract">
            Alterar para pessoa jurídica
          </Link>
          <Link className={backLinkClassName} to="/consultas/colaboradores">
            Voltar aos colaboradores
          </Link>
        </div>
      </div>
    );
  }

  return <CollaboratorFormPage mode="create" />;
}
