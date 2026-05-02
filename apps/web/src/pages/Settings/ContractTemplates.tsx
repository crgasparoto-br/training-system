import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eye, FileText, Plus, Save } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { CONTRACT_VARIABLES, contractService, type ContractTemplate } from '../../services/contract.service';

type VariableItem = { key: string; token: string };

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
  variables: VariableItem[];
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);

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
            className="ml-auto h-8 min-w-[180px] rounded-md border border-input bg-background px-2 text-xs"
            aria-label="Inserir variável"
            defaultValue=""
            onChange={(event) => {
              insertVariable(event.target.value);
              event.target.value = '';
            }}
          >
            <option value="">Inserir variável</option>
            {variables.map((variable) => (
              <option key={variable.key} value={variable.token}>
                {variable.key}
              </option>
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

export default function ContractTemplates() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [variables, setVariables] = useState<VariableItem[]>(CONTRACT_VARIABLES);
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
        <Button onClick={() => { setSelectedId(null); setDraft(emptyTemplate); }}>
          <Plus size={16} className="mr-2" />
          Novo modelo
        </Button>
      </div>

      {message && <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_260px]">
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

        <Card>
          <CardHeader>
            <CardTitle>Variáveis</CardTitle>
            <CardDescription>Também estão disponíveis no seletor de cada editor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {variables.map((variable) => (
              <button
                key={variable.key}
                type="button"
                className="block w-full rounded bg-muted px-2 py-1 text-left text-xs transition hover:bg-muted/70"
                onClick={() => navigator.clipboard?.writeText(variable.token)}
              >
                {variable.key}
              </button>
            ))}
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
