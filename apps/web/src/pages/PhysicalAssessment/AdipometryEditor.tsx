import { Calculator, CircleAlert, HelpCircle, RotateCcw, Save } from 'lucide-react';
import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentSummary,
  AdipometryCalculationPreview,
  AdipometryInputField,
  AdipometryProtocolSummary,
} from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import type { AdipometryAnthropometrySupport } from '../../services/adipometry.service';
import {
  ADIPOMETRY_INPUTS,
  ADIPOMETRY_SKINFOLD_HELP,
  adipometryProtocolKey,
  type AdipometryFormState,
  type AdipometrySkinfoldHelp,
} from './adipometry-ui';
import { HistoryPanel, Results, SupportCard } from './AdipometryViewSections';

export interface AdipometryEditorProps {
  selectedAlunoId: string;
  current: AdipometryAssessmentDetail | null;
  assessments: AdipometryAssessmentSummary[];
  protocols: AdipometryProtocolSummary[];
  form: AdipometryFormState;
  preview: AdipometryCalculationPreview | null;
  support: AdipometryAnthropometrySupport | null;
  fieldErrors: Partial<Record<AdipometryInputField, string>>;
  busy: boolean;
  dirty: boolean;
  canMutate: boolean;
  canCorrect: boolean;
  capacityWarningConfirmed: boolean;
  onForm: <K extends keyof AdipometryFormState>(field: K, value: AdipometryFormState[K]) => void;
  onMeasurement: (field: AdipometryInputField, value: string) => void;
  onHelp: (item: AdipometrySkinfoldHelp) => void;
  onSave: () => void;
  onCalculate: () => void;
  onFinalize: () => void;
  onCorrection: () => void;
  onCancelCorrection: () => void;
  onOpen: (id: string) => void;
  onCapacityWarning: (checked: boolean) => void;
}

export function AdipometryEditor(props: AdipometryEditorProps) {
  const {
    selectedAlunoId, current, assessments, protocols, form, preview, support, fieldErrors,
    busy, dirty, canMutate, canCorrect, capacityWarningConfirmed,
  } = props;
  const readOnly = !current || current.status !== 'DRAFT' || current.revisionStatus !== 'DRAFT' || !canMutate;
  const persistedProtocol = current?.protocolCode && current.protocolVersion ? `${current.protocolCode}::${current.protocolVersion}` : '';
  const persistedUnavailable = Boolean(persistedProtocol && !protocols.some((item) => adipometryProtocolKey(item) === persistedProtocol));
  const selectedProtocol = protocols.find((item) => adipometryProtocolKey(item) === form.protocolKey);
  const currentCorrection = Boolean(current && current.revisionStatus === 'DRAFT' && current.revisionNumber > 1);

  return (
    <>
      {current ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,0.8fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Protocolo e decisão clínica</CardTitle>
                <CardDescription>Selecione explicitamente o protocolo aprovado. Não há fallback silencioso.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label htmlFor="adpt-protocol" className="mb-2 block text-sm font-medium">Protocolo *</label>
                  <select id="adpt-protocol" value={form.protocolKey} disabled={readOnly} onChange={(event) => props.onForm('protocolKey', event.target.value)} className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm disabled:bg-muted">
                    <option value="">Selecione o protocolo</option>
                    {persistedUnavailable ? <option value={persistedProtocol}>{current.protocolCode} v{current.protocolVersion} — indisponível para nova seleção</option> : null}
                    {protocols.map((protocol) => <option key={adipometryProtocolKey(protocol)} value={adipometryProtocolKey(protocol)} disabled={!protocol.compatibility.compatible}>{protocol.name} · {protocol.code} v{protocol.version}{protocol.compatibility.compatible ? '' : ' — incompatível'}</option>)}
                  </select>
                  {selectedProtocol?.compatibility.reasons.length ? <p className="mt-2 text-xs text-destructive">{selectedProtocol.compatibility.reasons.map((item) => item.message).join(' ')}</p> : null}
                  {persistedUnavailable ? <p className="mt-2 text-xs text-amber-800">O protocolo histórico permanece visível, mas não será substituído automaticamente.</p> : null}
                </div>
                <div>
                  <label htmlFor="adpt-sex" className="mb-2 block text-sm font-medium">Sexo de referência *</label>
                  <select id="adpt-sex" value={form.protocolSex} disabled={readOnly} onChange={(event) => props.onForm('protocolSex', event.target.value as AdipometryFormState['protocolSex'])} className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm disabled:bg-muted">
                    <option value="">Confirme o sexo usado pelo protocolo</option>
                    <option value="male">Masculino</option>
                    <option value="female">Feminino</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="adpt-sex-source" className="mb-2 block text-sm font-medium">Origem da decisão *</label>
                  <select id="adpt-sex-source" value={form.protocolSexSource} disabled={readOnly} onChange={(event) => props.onForm('protocolSexSource', event.target.value as AdipometryFormState['protocolSexSource'])} className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm disabled:bg-muted">
                    <option value="">Selecione a origem</option>
                    <option value="profile">Cadastro do aluno</option>
                    <option value="professional_confirmation">Confirmação profissional</option>
                    <option value="professional_override">Divergência confirmada pelo profissional</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="adpt-sex-reason" className="mb-2 block text-sm font-medium">Justificativa da divergência</label>
                  <input id="adpt-sex-reason" value={form.protocolSexOverrideReason} disabled={readOnly || form.protocolSexSource !== 'professional_override'} onChange={(event) => props.onForm('protocolSexOverrideReason', event.target.value)} placeholder="Obrigatória quando houver divergência" className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm disabled:bg-muted" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Coleta de medidas</CardTitle>
                <CardDescription>Use vírgula ou ponto decimal. Qualquer edição invalida a prévia anterior.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {ADIPOMETRY_INPUTS.map((input) => {
                  const help = ADIPOMETRY_SKINFOLD_HELP.find((item) => item.field === input.field);
                  return (
                    <div key={input.field}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label htmlFor={`adpt-${input.field}`} className="text-sm font-medium">{input.label} ({input.unit})</label>
                        {help ? <button type="button" disabled={false} onClick={() => props.onHelp(help)} className="rounded p-1 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Abrir ajuda de ${input.label}`}><HelpCircle className="h-4 w-4" /></button> : null}
                      </div>
                      <input id={`adpt-${input.field}`} inputMode="decimal" value={form.measurements[input.field]} disabled={readOnly} onChange={(event) => props.onMeasurement(input.field, event.target.value)} className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm disabled:bg-muted" />
                      {fieldErrors[input.field] ? <p className="mt-1 text-xs text-destructive">{fieldErrors[input.field]}</p> : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <SupportCard support={support} selectedId={form.anthropometryAssessmentId} disabled={readOnly} onSelect={(id) => props.onForm('anthropometryAssessmentId', id)} />

            <Card>
              <CardHeader><CardTitle>Observações</CardTitle><CardDescription>Registre condições que possam influenciar a comparação entre avaliações.</CardDescription></CardHeader>
              <CardContent><textarea rows={4} value={form.notes} disabled={readOnly} onChange={(event) => props.onForm('notes', event.target.value)} className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm disabled:bg-muted" /></CardContent>
            </Card>

            <Results preview={preview} detail={current} />

            {preview?.compatibility.reasons.some((item) => item.code === 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED') ? (
              <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <input type="checkbox" className="mt-1" checked={capacityWarningConfirmed} onChange={(event) => props.onCapacityWarning(event.target.checked)} />
                Confirmo que revisei o alerta de capacidade do adipômetro e desejo recalcular.
              </label>
            ) : null}

            <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-4">
              <Button type="button" variant="outline" onClick={props.onSave} disabled={readOnly || busy || !dirty}><Save className="h-4 w-4" aria-hidden="true" />Salvar rascunho</Button>
              <Button type="button" onClick={props.onCalculate} disabled={readOnly || busy}><Calculator className="h-4 w-4" aria-hidden="true" />Salvar e calcular</Button>
              <Button type="button" onClick={props.onFinalize} disabled={!preview?.canFinalize || dirty || busy}>Concluir avaliação</Button>
              {current.revisionStatus === 'FINALIZED' && canCorrect ? <Button type="button" variant="outline" onClick={props.onCorrection}><RotateCcw className="h-4 w-4" aria-hidden="true" />Iniciar correção</Button> : null}
              {currentCorrection && canCorrect ? <Button type="button" variant="outline" onClick={props.onCancelCorrection}>Cancelar correção</Button> : null}
              {dirty ? <span className="flex items-center gap-2 text-sm text-amber-800"><CircleAlert className="h-4 w-4" />Alterações não calculadas</span> : null}
            </div>
          </div>
          <HistoryPanel assessments={assessments} activeId={current.id} onOpen={props.onOpen} />
        </div>
      ) : selectedAlunoId ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">Nenhuma avaliação foi aberta. Crie um rascunho ou selecione um item do histórico.</div>
      ) : null}

    </>
  );
}
