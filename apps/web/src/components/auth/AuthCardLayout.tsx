import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/Card';
import { shellCopy } from '../../i18n/ptBR';

interface AuthCardLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCardLayout({ title, description, children, footer }: AuthCardLayoutProps) {
  const logoSrc = '/brand/acesso-logo.jpg';

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] md:grid-cols-[1.05fr_1fr]">
          <section className="hidden bg-sidebar p-10 text-sidebar-foreground md:flex md:flex-col md:justify-between">
            <div className="space-y-6">
              <img
                src={logoSrc}
                alt="Logo Sistema Acesso"
                className="h-12 w-auto rounded bg-white px-3 py-2 object-contain"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <span className="inline-flex w-fit rounded-full border border-white/20 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/80">
                {shellCopy.heroBadge}
              </span>
              <h1 className="text-3xl font-semibold leading-tight text-white">{shellCopy.heroTitle}</h1>
              <p className="max-w-sm text-sm text-white/70">
                {shellCopy.heroDescription}
              </p>
            </div>
            <p className="text-xs text-white/50">{shellCopy.heroFooter}</p>
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
