import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/Card';

interface AuthCardLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCardLayout({ title, description, children, footer }: AuthCardLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-2xl border bg-background shadow-xl md:grid-cols-[1.05fr_1fr]">
          <section className="hidden bg-slate-900 p-10 text-slate-100 md:flex md:flex-col md:justify-between">
            <div className="space-y-4">
              <span className="inline-flex w-fit rounded-full border border-slate-700 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-200">
                training_system
              </span>
              <h1 className="text-3xl font-semibold leading-tight">Gestao de Treinos</h1>
              <p className="max-w-sm text-sm text-slate-300">
                Acesse sua conta para organizar atletas, acompanhar execucoes e planejar periodizacoes com seguranca.
              </p>
            </div>
            <p className="text-xs text-slate-400">Ambiente seguro para educadores e alunos.</p>
          </section>

          <section className="p-4 sm:p-6 md:p-8">
            <Card className="border-none shadow-none">
              <CardHeader className="space-y-1 px-0">
                <CardTitle className="text-2xl font-semibold">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-0">{children}</CardContent>
              {footer ? <CardFooter className="flex flex-col gap-4 px-0">{footer}</CardFooter> : null}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
