import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

export type PreRegistrationAudience = 'public' | 'authenticated' | 'administrative';

interface PreRegistrationUnavailableProps {
  audience: PreRegistrationAudience;
}

const MESSAGE_BY_AUDIENCE: Record<PreRegistrationAudience, string> = {
  public:
    'O link não pode ser utilizado neste momento. Entre em contato com a equipe da academia para receber orientação.',
  authenticated:
    'O pré-cadastro está temporariamente indisponível. Seu progresso permanece salvo. Tente novamente mais tarde ou entre em contato com a equipe da academia.',
  administrative:
    'O fluxo está desabilitado neste ambiente. Nenhum cadastro ou convite existente foi apagado.',
};

export function PreRegistrationUnavailable({ audience }: PreRegistrationUnavailableProps) {
  const showHomeLink = audience !== 'public';

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
          {MESSAGE_BY_AUDIENCE[audience]}
        </p>
        {showHomeLink ? (
          <div className="mt-6">
            <Link
              to="/inicio"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Voltar ao início
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
