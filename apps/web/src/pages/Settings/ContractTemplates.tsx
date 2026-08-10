import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, Eye, FilePlus2, FileText, Info, Plus, Save, Trash2 } from 'lucide-react';
import type { ProfessorSummary } from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import type { Aluno } from '../../services/aluno.service';
import {
  contractService,
  type ContractPartyType,
  type ContractTemplate,
  type ContractTemplateApplicability,
} from '../../services/contract.service';
import {
  CONTRACT_VARIABLES,
  groupContractVariables,
  type ContractVariableDefinition,
} from '../../services/contractVariables';
import { collaboratorContractService } from '../../services/collaborator-contract.service';
import { professorService } from '../../services/professor.service';
import { loadActiveStudentsForContractPreview } from './contractPreviewStudents';
import {
  ACCESS_PERSONAL_TRAINING_TEMPLATE_NAME,
  createAccessPersonalTrainingTemplate,
} from './contractTemplatePresets';

const applicabilityLabels: Record<ContractTemplateApplicability, string> = {
  STUDENT: 'Aluno',
  COLLABORATOR: 'Colaborador',
  BOTH: 'Aluno e colaborador',
};

const emptyTemplate: Partial<ContractTemplate> = {
  name: '',
  description: '',
  version: 1,
  status: 'DRAFT',
  applicability: 'STUDENT',
  headerHtml: '<p><strong>{{empresa.razaoSocial}}</strong></p><p>{{empresa.endereco}}</p>',
  footerHtml: '<p>Documento gerado em {{contrato.dataAssinatura}}.</p>',
  clauses: [
    {
      order: 1,
      title: 'Objeto',
      bodyHtml: '<p>Contrato de prestação de serviços para {{aluno.nome}}.</p>',
      required: true,
      editable: true,
    },
  ],
};

function normalizeTemplate(template: Partial<ContractTemplate>): Partial<ContractTemplate> {
  return {
    ...template,
    applicability: template.applicability || 'STUDENT',
  };
}

function RichTextEditor({
  label,
  value,
  onChange,
  variables,
  minHeight = 140,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  variables: ContractVariableDefinition[];
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const variableGroups = useMemo(() => groupContractVariables(variables), [variables]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '<p></p>';
    }
  }, [value]);

  const sync = () => onChange(editorRef.current?.innerHTML || '');
  const run = (command: string, argument?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    sync();
  };
  const insertVariable = (token: string) => {
    if (!token) return;
    editorRef.current?.focus();
    document.execCommand('insertText', false, token);
    sync();
  };

  return (
    <div className="space-y-2">
      <div>
        <span className="text-sm font-medium text-foreground">{label}</span>
        <p className="text-xs text-muted-foreground">
          Escreva normalmente e use somente as variáveis disponíveis para a aplicabilidade selecionada.
        </p>
      </div>
      <div className="overflow-hidden rounded-md border border-input bg-white">
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 p-2">
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 font-bold" onClick={() => run('bold')}>B</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 italic" onClick={() => run('italic')}>I</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => run('formatBlock', 'H2')}>Título</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => run('formatBlock', 'P')}>Texto</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => run('insertUnorderedList')}>Lista</Button>
          <select
            className="ml-auto h-8 min-w-[210px] rounded-md border border-input bg-background px-2 text-xs"
            aria-label="Inserir variável"
            defaultValue=""
            onChange={(event) => {
              insertVariable(event.target.value);
              event.target.value = '';
            }}
          >
            <option value="">Inserir variável</option>
            {variableGroups.map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.variables.map((variable) => (
                  <option key={variable.key} value={variable.token}>
                    {variable.label} — {variable.key}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div
          ref={editorRef}
          contentEditable
          className="prose prose-sm max-w-none overflow-auto p-3 text-sm outline-none focus:bg-blue-50/20"
          style={{ minHeight }}
          onInput={sync}
          onBlur={sync}
          onPaste={(event) => {
            event.preventDefault();
            document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
            sync();
          }}
        />
      </div>
    </div>
  );
}

function VariableTree({
  variables,
  onCopy,
}: {
  variables: ContractVariableDefinition[];
  onCopy: (variable: ContractVariableDefinition) => void;
}) {
  const groups = useMemo(() => groupContractVariables(variables), [variables]);

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <details key={group.key} open className="group rounded-lg border border-border bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <span>{group.label}</span>
            <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              {group.variables.length}
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="space-y-1 border-t border-border p-2">
            {group.variables.map((variable) => {
              const tooltipId = `contract-variable-${variable.key.replace(/[^a-zA-Z0-9]+/gu, '-')}`;
              return (
                <div key={variable.key} className="relative">
                  <button
                    type="button"
                    className="peer flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-describedby={tooltipId}
                    aria-label={`Copiar variável ${variable.label}`}
                    onClick={() => onCopy(variable)}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground">{variable.label}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{variable.token}</span>
                    </span>
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                  <div
                    id={tooltipId}
                    role="tooltip"
                    className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-white opacity-0 shadow-xl transition peer-hover:visible peer-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100 xl:left-auto xl:right-full xl:top-0 xl:mr-2 xl:mt-0"
                  >
                    <p className="font-medium">{variable.description}</p>
                    <p className="mt-2 text-slate-300"><strong className="text-white">Exemplo:</strong> {variable.example}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

export default function ContractTemplates() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [variables, setVariables] = useState<ContractVariableDefinition[]>(CONTRACT_VARIABLES);
  const [previewStudents, setPreviewStudents] = useState<Aluno[]>([]);
  const [previewCollaborators, setPreviewCollaborators] = useState<ProfessorSummary[]>([]);
  const [previewPartyType, setPreviewPartyType] = useState<ContractPartyType>('STUDENT');
  const [previewPartyId, setPreviewPartyId] = useState('');
  const [applicabilityFilter, setApplicabilityFilter] = useState<'ALL' | ContractTemplateApplicability>('ALL');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ContractTemplate>>(emptyTemplate);
  const [previewHtml, setPreviewHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewPartiesLoading, setPreviewPartiesLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId),
    [selectedId, templates]
  );
  const filteredTemplates = useMemo(
    () => templates.filter((template) =>
      applicabilityFilter === 'ALL' || template.applicability === applicabilityFilter
    ),
    [applicabilityFilter, templates]
  );
  const allowedPreviewPartyTypes = useMemo<ContractPartyType[]>(() => {
    if (draft.applicability === 'COLLABORATOR') return ['COLLABORATOR'];
    if (draft.applicability === 'BOTH') return ['STUDENT', 'COLLABORATOR'];
    return ['STUDENT'];
  }, [draft.applicability]);
  const previewParties = previewPartyType === 'STUDENT' ? previewStudents : previewCollaborators;
  const selectedPreviewParty = previewParties.find((party) => party.id === previewPartyId);
  const selectedPreviewPartyName = selectedPreviewParty?.user.profile.name || 'parte selecionada';

  async function load() {
    setLoading(true);
    const [loadedTemplates, loadedVariables] = await Promise.all([
      contractService.listTemplates(),
      contractService.listVariables({ applicability: draft.applicability || 'STUDENT' }),
    ]);
    const normalizedTemplates = loadedTemplates.map((template) => ({
      ...template,
      applicability: template.applicability || 'STUDENT',
    }));
    setTemplates(normalizedTemplates);
    setVariables(loadedVariables);

    if (!selectedId && normalizedTemplates[0]) {
      setSelectedId(normalizedTemplates[0].id);
      setDraft(normalizeTemplate(normalizedTemplates[0]));
    }

    setPreviewPartiesLoading(true);
    try {
      const [students, collaborators] = await Promise.all([
        loadActiveStudentsForContractPreview(),
        professorService.list('active'),
      ]);
      setPreviewStudents(students);
      setPreviewCollaborators(collaborators);
    } catch {
      setPreviewStudents([]);
      setPreviewCollaborators([]);
      setMessage('Modelos carregados, mas não foi possível carregar as pessoas para a prévia.');
    } finally {
      setPreviewPartiesLoading(false);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load().catch(() => {
      setMessage('Não foi possível carregar os modelos.');
      setLoading(false);
      setPreviewPartiesLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selected) {
      setDraft(normalizeTemplate(selected));
      setPreviewHtml('');
    }
  }, [selected]);

  useEffect(() => {
    const applicability = draft.applicability || 'STUDENT';
    void contractService.listVariables({ applicability })
      .then(setVariables)
      .catch(() => setVariables(CONTRACT_VARIABLES));

    const nextPartyType = applicability === 'COLLABORATOR' ? 'COLLABORATOR' : 'STUDENT';
    setPreviewPartyType((current) =>
      applicability === 'BOTH' || current === nextPartyType ? current : nextPartyType
    );
  }, [draft.applicability]);

  useEffect(() => {
    const parties = previewPartyType === 'STUDENT' ? previewStudents : previewCollaborators;
    setPreviewPartyId((current) =>
      current && parties.some((party) => party.id === current) ? current : parties[0]?.id || ''
    );
  }, [previewCollaborators, previewPartyType, previewStudents]);

  useEffect(() => {
    if (!previewDialogOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !previewing) setPreviewDialogOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewDialogOpen, previewing]);

  const updateClause = (index: number, field: string, value: string | number | boolean) => {
    const clauses = [...(draft.clauses || [])];
    clauses[index] = { ...clauses[index], [field]: value };
    setDraft({ ...draft, clauses });
  };

  const startNewTemplate = () => {
    setSelectedId(null);
    setDraft({ ...emptyTemplate, clauses: emptyTemplate.clauses?.map((clause) => ({ ...clause })) });
    setPreviewHtml('');
    setMessage(null);
  };

  const loadAccessTemplate = () => {
    const existingTemplate = templates.find(
      (template) => template.name === ACCESS_PERSONAL_TRAINING_TEMPLATE_NAME
    );
    if (existingTemplate) {
      setSelectedId(existingTemplate.id);
      setMessage('O modelo ACESSO já existe e foi selecionado para revisão.');
      return;
    }
    setSelectedId(null);
    setDraft(normalizeTemplate(createAccessPersonalTrainingTemplate()));
    setPreviewHtml('');
    setMessage('Modelo ACESSO carregado como rascunho para alunos. Revise e salve para disponibilizá-lo.');
  };

  const copyVariable = async (variable: ContractVariableDefinition) => {
    await navigator.clipboard?.writeText(variable.token);
    setMessage(`Variável ${variable.token} copiada.`);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = normalizeTemplate(draft);
      const saved = draft.id
        ? await contractService.updateTemplate(draft.id, payload)
        : await contractService.createTemplate(payload);
      await load();
      setSelectedId(saved.id);
      setMessage('Modelo salvo com a aplicabilidade e as variáveis validadas.');
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Erro ao salvar modelo.');
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!draft.id) return;
    setSaving(true);
    try {
      const duplicated = await contractService.duplicateTemplate(draft.id);
      await load();
      setSelectedId(duplicated.id);
      setMessage('Modelo duplicado mantendo a mesma aplicabilidade.');
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Erro ao duplicar modelo.');
    } finally {
      setSaving(false);
    }
  };

  const openPreviewDialog = () => {
    if (!draft.id) {
      setMessage('Salve o modelo antes de gerar a prévia.');
      return;
    }
    const initialType = allowedPreviewPartyTypes[0];
    setPreviewPartyType(initialType);
    setPreviewDialogOpen(true);
    setMessage(null);
  };

  const preview = async () => {
    if (!draft.id || !previewPartyId) {
      setMessage('Selecione a pessoa cujos dados serão usados na prévia.');
      return;
    }
    setPreviewing(true);
    setMessage(null);
    try {
      const result = previewPartyType === 'STUDENT'
        ? await contractService.preview({ templateId: draft.id, alunoId: previewPartyId })
        : await collaboratorContractService.preview(previewPartyId, { templateId: draft.id });
      setPreviewHtml(result.html);
      setPreviewDialogOpen(false);
      setMessage(`Prévia gerada com os dados de ${selectedPreviewPartyName}.`);
    } catch (error: any) {
      setPreviewHtml('');
      setMessage(error.response?.data?.error || 'Não foi possível gerar a prévia do contrato.');
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modelos de contrato</h1>
          <p className="text-sm text-muted-foreground">
            Defina se cada modelo atende alunos, colaboradores ou ambos. Modelos compartilhados aceitam apenas variáveis comuns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadAccessTemplate}>
            <FilePlus2 size={16} className="mr-2" /> Usar modelo ACESSO
          </Button>
          <Button onClick={startNewTemplate}>
            <Plus size={16} className="mr-2" /> Novo modelo
          </Button>
        </div>
      </div>

      {message ? <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <Card>
          <CardHeader>
            <CardTitle>Modelos</CardTitle>
            <CardDescription>Filtre pela parte contratada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={applicabilityFilter}
              onChange={(event) => setApplicabilityFilter(event.target.value as typeof applicabilityFilter)}
            >
              <option value="ALL">Todos</option>
              <option value="STUDENT">Aluno</option>
              <option value="COLLABORATOR">Colaborador</option>
              <option value="BOTH">Aluno e colaborador</option>
            </select>
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                className={`w-full rounded-md border p-3 text-left text-sm ${selectedId === template.id ? 'border-blue-500 bg-blue-50' : 'border-border bg-white'}`}
                onClick={() => setSelectedId(template.id)}
              >
                <div className="font-medium">{template.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  v{template.version} · {template.status} · {applicabilityLabels[template.applicability || 'STUDENT']}
                </div>
              </button>
            ))}
            {filteredTemplates.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum modelo neste filtro.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Editor</CardTitle>
            <CardDescription>O mesmo conteúdo é usado na prévia, no PDF e na versão assinada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_150px_190px]">
              <Input label="Nome" value={draft.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              <Input label="Versão" type="number" value={draft.version || 1} onChange={(event) => setDraft({ ...draft, version: Number(event.target.value) })} />
              <label className="text-sm font-medium">
                Status
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.status || 'DRAFT'}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value as ContractTemplate['status'] })}
                >
                  <option value="DRAFT">Rascunho</option>
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Aplicabilidade
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.applicability || 'STUDENT'}
                  onChange={(event) => {
                    setDraft({ ...draft, applicability: event.target.value as ContractTemplateApplicability });
                    setPreviewHtml('');
                  }}
                >
                  <option value="STUDENT">Aluno</option>
                  <option value="COLLABORATOR">Colaborador</option>
                  <option value="BOTH">Aluno e colaborador</option>
                </select>
              </label>
            </div>
            <Input label="Descrição" value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />

            {draft.applicability === 'BOTH' ? (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                Este modelo pode ser usado para ambas as partes. O editor mostra somente variáveis comuns.
              </div>
            ) : null}

            <RichTextEditor label="Cabeçalho" value={draft.headerHtml || ''} variables={variables} minHeight={110} onChange={(value) => setDraft({ ...draft, headerHtml: value })} />
            <RichTextEditor label="Rodapé" value={draft.footerHtml || ''} variables={variables} minHeight={110} onChange={(value) => setDraft({ ...draft, footerHtml: value })} />

            <div className="space-y-3">
              {(draft.clauses || []).map((clause, index) => (
                <div key={clause.id || `${index}-${clause.order}`} className="rounded-md border border-border p-3">
                  <div className="grid gap-3 md:grid-cols-[80px_minmax(0,1fr)_44px]">
                    <Input label="Ordem" type="number" value={clause.order} onChange={(event) => updateClause(index, 'order', Number(event.target.value))} />
                    <Input label="Título" value={clause.title} onChange={(event) => updateClause(index, 'title', event.target.value)} />
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-6 h-10 w-10 p-0 text-destructive"
                      aria-label={`Remover cláusula ${clause.title}`}
                      onClick={() => setDraft({ ...draft, clauses: (draft.clauses || []).filter((_, itemIndex) => itemIndex !== index) })}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                  <div className="mt-3">
                    <RichTextEditor label="Texto da cláusula" value={clause.bodyHtml} variables={variables} onChange={(value) => updateClause(index, 'bodyHtml', value)} />
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => setDraft({
                  ...draft,
                  clauses: [...(draft.clauses || []), {
                    order: (draft.clauses?.length || 0) + 1,
                    title: 'Nova cláusula',
                    bodyHtml: '<p></p>',
                    required: true,
                    editable: true,
                  }],
                })}
              >
                <Plus size={16} className="mr-2" /> Cláusula
              </Button>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {draft.id ? (
                <Button variant="outline" onClick={duplicate} disabled={saving}>
                  <Copy size={16} className="mr-2" /> Duplicar
                </Button>
              ) : null}
              <Button variant="outline" onClick={openPreviewDialog}>
                <Eye size={16} className="mr-2" /> Prévia
              </Button>
              <Button onClick={save} isLoading={saving}>
                <Save size={16} className="mr-2" /> Salvar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle>Variáveis</CardTitle>
            <CardDescription>
              A lista respeita a aplicabilidade. Clique em uma variável para copiar o token.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VariableTree variables={variables} onCopy={copyVariable} />
          </CardContent>
        </Card>
      </div>

      {previewHtml ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText size={18} /> Prévia</CardTitle></CardHeader>
          <CardContent>
            <iframe className="h-[620px] w-full rounded-md border border-border bg-white" srcDoc={previewHtml} title="Prévia do contrato" />
          </CardContent>
        </Card>
      ) : null}

      {previewDialogOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !previewing) setPreviewDialogOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="contract-preview-dialog-title" className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl">
            <h2 id="contract-preview-dialog-title" className="text-lg font-semibold text-foreground">Gerar prévia do contrato</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use dados reais apenas para validar o preenchimento das variáveis.</p>

            {allowedPreviewPartyTypes.length > 1 ? (
              <label className="mt-4 block text-sm font-medium">
                Parte contratada
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={previewPartyType}
                  disabled={previewing}
                  onChange={(event) => setPreviewPartyType(event.target.value as ContractPartyType)}
                >
                  <option value="STUDENT">Aluno</option>
                  <option value="COLLABORATOR">Colaborador</option>
                </select>
              </label>
            ) : null}

            <label className="mt-4 block text-sm font-medium" htmlFor="contract-preview-party">
              {previewPartyType === 'STUDENT' ? 'Aluno' : 'Colaborador'}
            </label>
            <select
              id="contract-preview-party"
              autoFocus
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={previewPartyId}
              disabled={previewPartiesLoading || previewParties.length === 0 || previewing}
              onChange={(event) => {
                setPreviewPartyId(event.target.value);
                setPreviewHtml('');
              }}
            >
              <option value="">
                {previewPartiesLoading
                  ? 'Carregando...'
                  : previewParties.length === 0
                    ? `Nenhum ${previewPartyType === 'STUDENT' ? 'aluno' : 'colaborador'} ativo disponível`
                    : 'Selecione uma pessoa'}
              </option>
              {previewParties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.user.profile.name} — {party.user.email}
                </option>
              ))}
            </select>

            <p className="mt-3 text-xs text-muted-foreground">
              Nenhum documento será criado, enviado ou alterado durante a prévia.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPreviewDialogOpen(false)} disabled={previewing}>Cancelar</Button>
              <Button onClick={preview} isLoading={previewing} disabled={previewPartiesLoading || previewParties.length === 0 || !previewPartyId}>
                Gerar prévia
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
