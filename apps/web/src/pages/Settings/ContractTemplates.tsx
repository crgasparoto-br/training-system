import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, Eye, FilePlus2, FileText, Info, Plus, Save } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { contractService, type ContractTemplate } from '../../services/contract.service';
import {
  CONTRACT_VARIABLES,
  groupContractVariables,
  type ContractVariableDefinition,
} from '../../services/contractVariables';
import {
  ACCESS_PERSONAL_TRAINING_TEMPLATE_NAME,
  createAccessPersonalTrainingTemplate,
} from './contractTemplatePresets';

const emptyTemplate: Partial<ContractTemplate> = {
  name: '',
  description: '',
  version: 1,
  status: 'DRAFT',
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

  const sync = () => {
    onChange(editorRef.current?.innerHTML || '');
  };

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
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          Escreva normalmente e use os botões para formatar. As variáveis serão preenchidas ao gerar o contrato.
        </span>
      </div>
      <div className="overflow-hidden rounded-md border border-input bg-white">
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 p-2">
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 font-bold" onClick={() => run('bold')}>
            B
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 italic" onClick={() => run('italic')}>
            I
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => run('formatBlock', 'H2')}>
            Título
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => run('formatBlock', 'P')}>
            Texto
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => run('insertUnorderedList')}>
            Lista
          </Button>
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
            const text = event.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
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
        <details key={group.key} defaultOpen className="group rounded-lg border border-border bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <span>{group.label}</span>
            <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              {group.variables.length}
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="space-y-1 border-t border-border p-2">
            {group.variables.map((variable) => {
              const tooltipId = `contract-variable-${variable.key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
              const tooltipText = `${variable.description} Exemplo: ${variable.example}`;

              return (
                <div key={variable.key} className="relative">
                  <button
                    type="button"
                    className="peer flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-describedby={tooltipId}
                    aria-label={`Copiar variável ${variable.label}`}
                    title={tooltipText}
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
                    <p className="mt-2 text-slate-300">
                      <strong className="text-white">Exemplo:</strong> {variable.example}
                    </p>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ContractTemplate>>(emptyTemplate);
  const [previewHtml, setPreviewHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId),
    [selectedId, templates]
  );

  async function load() {
    setLoading(true);
    const [loadedTemplates, loadedVariables] = await Promise.all([
      contractService.listTemplates(),
      contractService.listVariables(),
    ]);
    setTemplates(loadedTemplates);
    setVariables(loadedVariables);
    if (!selectedId && loadedTemplates[0]) {
      setSelectedId(loadedTemplates[0].id);
      setDraft(loadedTemplates[0]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => {
      setMessage('Não foi possível carregar os modelos.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selected) {
      setDraft(selected);
      setPreviewHtml('');
    }
  }, [selected]);

  const updateClause = (index: number, field: string, value: string | number | boolean) => {
    const clauses = [...(draft.clauses || [])];
    clauses[index] = { ...clauses[index], [field]: value };
    setDraft({ ...draft, clauses });
  };

  const startNewTemplate = () => {
    setSelectedId(null);
    setDraft(emptyTemplate);
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
    setDraft(createAccessPersonalTrainingTemplate());
    setPreviewHtml('');
    setMessage('Modelo ACESSO carregado como rascunho. Revise o conteúdo e salve para disponibilizá-lo.');
  };

  const copyVariable = async (variable: ContractVariableDefinition) => {
    await navigator.clipboard?.writeText(variable.token);
    setMessage(`Variável ${variable.token} copiada.`);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = draft.id
        ? await contractService.updateTemplate(draft.id, draft)
        : await contractService.createTemplate(draft);
      await load();
      setSelectedId(saved.id);
      setMessage('Modelo salvo.');
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Erro ao salvar modelo.');
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    if (!draft.id) {
      setMessage('Salve o modelo antes de gerar prévia.');
      return;
    }
    const result = await contractService.preview({ templateId: draft.id, alunoId: 'preview' }).catch(() => null);
    setPreviewHtml(result?.html || '<p>Use um aluno real na tela de contratos do aluno para uma prévia preenchida.</p>');
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modelos de contrato</h1>
          <p className="text-sm text-muted-foreground">Edite cabeçalho, rodapé, cláusulas e variáveis dinâmicas sem escrever HTML.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadAccessTemplate}>
            <FilePlus2 size={16} className="mr-2" />
            Usar modelo ACESSO
          </Button>
          <Button onClick={startNewTemplate}>
            <Plus size={16} className="mr-2" />
            Novo modelo
          </Button>
        </div>
      </div>

      {message && <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <Card>
          <CardHeader>
            <CardTitle>Modelos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.map((template) => (
              <button
                key={template.id}
                className={`w-full rounded-md border p-3 text-left text-sm ${selectedId === template.id ? 'border-blue-500 bg-blue-50' : 'border-border bg-white'}`}
                onClick={() => setSelectedId(template.id)}
              >
                <div className="font-medium">{template.name}</div>
                <div className="text-xs text-muted-foreground">v{template.version} · {template.status}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Editor</CardTitle>
            <CardDescription>Os textos abaixo serão usados na prévia, no PDF e na versão assinada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_160px]">
              <Input label="Nome" value={draft.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              <Input label="Versão" type="number" value={draft.version || 1} onChange={(event) => setDraft({ ...draft, version: Number(event.target.value) })} />
              <label className="text-sm font-medium">
                Status
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.status || 'DRAFT'}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value as ContractTemplate['status'] })}
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
            </div>
            <Input label="Descrição" value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />

            <RichTextEditor
              label="Cabeçalho"
              value={draft.headerHtml || ''}
              variables={variables}
              minHeight={110}
              onChange={(value) => setDraft({ ...draft, headerHtml: value })}
            />
            <RichTextEditor
              label="Rodapé"
              value={draft.footerHtml || ''}
              variables={variables}
              minHeight={110}
              onChange={(value) => setDraft({ ...draft, footerHtml: value })}
            />

            <div className="space-y-3">
              {(draft.clauses || []).map((clause, index) => (
                <div key={index} className="rounded-md border border-border p-3">
                  <div className="grid gap-3 md:grid-cols-[80px_minmax(0,1fr)]">
                    <Input label="Ordem" type="number" value={clause.order} onChange={(event) => updateClause(index, 'order', Number(event.target.value))} />
                    <Input label="Título" value={clause.title} onChange={(event) => updateClause(index, 'title', event.target.value)} />
                  </div>
                  <div className="mt-3">
                    <RichTextEditor
                      label="Texto da cláusula"
                      value={clause.bodyHtml}
                      variables={variables}
                      onChange={(value) => updateClause(index, 'bodyHtml', value)}
                    />
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setDraft({ ...draft, clauses: [...(draft.clauses || []), { order: (draft.clauses?.length || 0) + 1, title: 'Nova cláusula', bodyHtml: '<p></p>', required: true, editable: true }] })}>
                <Plus size={16} className="mr-2" />
                Cláusula
              </Button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {draft.id && (
                <Button variant="outline" onClick={() => contractService.duplicateTemplate(draft.id!).then(load)}>
                  <Copy size={16} className="mr-2" />
                  Duplicar
                </Button>
              )}
              <Button variant="outline" onClick={preview}>
                <Eye size={16} className="mr-2" />
                Prévia
              </Button>
              <Button onClick={save} isLoading={saving}>
                <Save size={16} className="mr-2" />
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle>Variáveis</CardTitle>
            <CardDescription>
              Abra um grupo, passe o mouse sobre uma variável para ver a explicação e clique para copiar o token.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VariableTree variables={variables} onCopy={copyVariable} />
          </CardContent>
        </Card>
      </div>

      {previewHtml && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText size={18} /> Prévia</CardTitle>
          </CardHeader>
          <CardContent>
            <iframe className="h-[620px] w-full rounded-md border border-border bg-white" srcDoc={previewHtml} title="Prévia do contrato" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
