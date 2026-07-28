import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface PreRegistrationUnavailableProps {
  audience: 'public' | 'administrative';
}

export function PreRegistrationUnavailable({ audience }: PreRegistrationUnavailableProps) {
  const isPublic = audience === 'public';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8"
        aria-labelledby="pre-registration-unavailable-title"
        role="status"
      >
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground">
          <AlertTriangle aria-hidden="true" size={24} />
        </div>
        <h1
          id="pre-registration-unavailable-title"
          className="text-2xl font-semibold text-foreground"
        >
          Pré-matrícula temporariamente indisponível
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          {isPublic
            ? 'O link não pode ser utilizado neste momento. Entre em contato com a equipe da academia para receber orientação.'
            : 'O fluxo está desabilitado neste ambiente. Nenhum cadastro ou convite existente foi apagado.'}
        </p>
        {!isPublic ? (
          <div className="mt-6">
            <Button asChild>
              <Link to="/inicio">Voltar ao início</Link>
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
