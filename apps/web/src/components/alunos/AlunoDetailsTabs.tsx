type AlunoDetailsTab =
  | 'resumo'
  | 'cadastro'
  | 'saude-anamnese'
  | 'financeiro'
  | 'plano-avaliacoes'
  | 'avaliacoes-fisicas'
  | 'revisoes-cadastrais';

type AlunoDetailsTabsProps = {
  activeTab: AlunoDetailsTab;
  onChange: (tab: AlunoDetailsTab) => void;
  visibleTabs?: AlunoDetailsTab[];
};

const tabs: Array<{ id: AlunoDetailsTab; label: string }> = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'saude-anamnese', label: 'Saúde / Anamnese' },
  { id: 'financeiro', label: 'Financeiro / Contrato' },
  { id: 'plano-avaliacoes', label: 'Plano de Avaliações' },
  { id: 'avaliacoes-fisicas', label: 'Avaliações Físicas' },
  { id: 'revisoes-cadastrais', label: 'Revisões Cadastrais' },
];

export function AlunoDetailsTabs({ activeTab, onChange, visibleTabs }: AlunoDetailsTabsProps) {
  const tabsToRender = visibleTabs && visibleTabs.length > 0
    ? tabs.filter((tab) => visibleTabs.includes(tab.id))
    : tabs;

  return (
    <div className="overflow-x-auto border-b">
      <div className="flex min-w-max gap-2 px-1">
        {tabsToRender.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export type { AlunoDetailsTab };
