import { Link } from 'react-router-dom';

export const protocolNavItems = [
  ['antropometria', 'Antropometria'],
  ['prontuario-entrevista-acompanhamento', 'Prontuário'],
  ['prescricao-capacidades', 'Prescrição por capacidades'],
  ['adipometria', 'Adipometria'],
  ['bioimpedanciometria', 'Bioimpedanciometria'],
  ['ultrassonografia', 'Ultrassonografia'],
] as const;

export type ProtocolSlug = (typeof protocolNavItems)[number][0];

export function buildProtocolPath(slug: string, alunoId: string) {
  return alunoId ? `/protocolo-avaliacao-fisica/${slug}?alunoId=${alunoId}` : `/protocolo-avaliacao-fisica/${slug}`;
}

export function ProtocolNavTabs({ activeSlug, alunoId }: { activeSlug: ProtocolSlug | string; alunoId: string }) {
  return (
    <nav aria-label="Protocolos de avaliação física" className="protocol-nav-tabs flex flex-wrap gap-2">
      {protocolNavItems.map(([slug, label]) => (
        <Link
          key={slug}
          to={buildProtocolPath(slug, alunoId)}
          aria-current={slug === activeSlug ? 'page' : undefined}
          className={
            slug === activeSlug
              ? 'protocol-nav-tab-link rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary'
              : 'protocol-nav-tab-link rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted'
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
