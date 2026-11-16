import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, RefreshCcw, X } from 'lucide-react';
import type {
  PostWorkoutDecisionAction, PostWorkoutDecisionSource, PostWorkoutDecisionView,
} from '@corrida/types';
import { Button } from '../components/ui/Button';
import { postWorkoutDecisionService } from '../services/post-workout-decision.service';

type Props={
  alunoId:string;
  contractId:string|null;
  authorizationKey:string;
  canView:boolean;
  canSuggest:boolean;
  canApprove:boolean;
  canApply:boolean;
};
type Data={decisions:PostWorkoutDecisionView[];planningVersions:Record<string,number>;sources:PostWorkoutDecisionSource[]};
const actionLabels:Record<PostWorkoutDecisionAction,string>={
  maintain:'Manter',progress:'Progredir',reduce:'Reduzir',replace:'Substituir',
  suspend:'Suspender',reassess:'Reavaliar',
};
const statusLabels={suggested:'Aguardando análise',approved:'Aprovada',rejected:'Rejeitada',applied:'Aplicada'} as const;
const nextKey=()=>('post-workout-'+(typeof crypto!=='undefined' && crypto.randomUUID
  ? crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)));
function errorMessage(error:unknown){
  const e=error as {response?:{status?:number;data?:{error?:string}}};
  if(e.response?.status===409)return 'Os dados mudaram. Atualize e revise a decisão antes de continuar.';
  if(e.response?.status===403)return 'Seu perfil não possui a permissão necessária para essa ação.';
  return e.response?.data?.error ?? 'Não foi possível concluir esta operação. Tente novamente.';
}
export function PostWorkoutDecisionPanel({
  alunoId,contractId,authorizationKey,canView,canSuggest,canApprove,canApply,
}:Props){
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [sourceId,setSourceId]=useState('');
  const [action,setAction]=useState<PostWorkoutDecisionAction>('reassess');
  const [rationale,setRationale]=useState('');
  const [studentMessage,setStudentMessage]=useState('');
  const [exposeToStudent,setExposeToStudent]=useState(false);
  const [reviewReason,setReviewReason]=useState('');
  const [effectiveFrom,setEffectiveFrom]=useState('');
  const [instruction,setInstruction]=useState('');
  const generation=useRef(0);
  const createKey=useRef<string|null>(null);
  const transitionKeys=useRef<Record<string,string>>({});
  const load=useCallback(async()=>{
    if(!canView || !contractId)return;
    const token=++generation.current;
    setLoading(true);
    try{
      const [list,sources]=await Promise.all([
        postWorkoutDecisionService.list(alunoId),
        postWorkoutDecisionService.sources(alunoId),
      ]);
      if(token===generation.current){
        setData({...list,sources});
        setError(null);
      }
    }catch(e){
      if(token===generation.current){setData(null);setError(errorMessage(e));}
    }finally{if(token===generation.current)setLoading(false);}
  },[alunoId,contractId,canView,authorizationKey]);
  useEffect(()=>{
    generation.current++;
    setData(null);setError(null);setSourceId('');
    createKey.current=null;transitionKeys.current={};
    if(canView && contractId)void load();
    return ()=>{generation.current++;};
  },[load,canView,contractId]);
  const resetCreateKey=()=>{createKey.current=null;};
  const suggest=async()=>{
    const source=data?.sources.find(x=>x.feedbackRevisionId===sourceId);
    if(!canSuggest||!source || saving)return;
    setSaving(true);setError(null);
    try{
      createKey.current ||=nextKey();
      await postWorkoutDecisionService.suggest(alunoId,{
        operationKey:createKey.current,workoutDayId:source.workoutDayId,
        sourceFeedbackRevisionId:source.feedbackRevisionId,action,
        rationale,studentMessage:studentMessage.trim()||null,exposeToStudent,
      });
      resetCreateKey();setRationale('');setStudentMessage('');setExposeToStudent(false);
      await load();
    }catch(e){setError(errorMessage(e));}
    finally{setSaving(false);}
  };
  const transition=async(row:PostWorkoutDecisionView,kind:'approve'|'reject'|'apply')=>{
    if(saving)return;
    setSaving(true);setError(null);
    const k=row.id+':'+kind;
    transitionKeys.current[k] ||=nextKey();
    try{
      const payload={operationKey:transitionKeys.current[k],expectedVersion:row.version};
      if(kind==='apply'){
        await postWorkoutDecisionService.transition(alunoId,row.id,kind,{
          ...payload,expectedPlanningVersion:data?.planningVersions[row.trainingPlanId]??0,
          effectiveFrom,instruction,
        });
      }else{
        await postWorkoutDecisionService.transition(alunoId,row.id,kind,{
          ...payload,reason:reviewReason.trim()||undefined,
        });
      }
      delete transitionKeys.current[k];
      setReviewReason('');setInstruction('');setEffectiveFrom('');
      await load();
    }catch(e){setError(errorMessage(e));}
    finally{setSaving(false);}
  };
  if(!canView||!contractId)return null;
  return <section className="mt-4 space-y-4 rounded-lg border border-border bg-background p-4 text-sm"
    aria-label="Decisões pós-treino">
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="font-semibold">Decisões pós-treino</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Sugestões com evidências do feedback. Aprovação e aplicação são etapas separadas.
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={loading||saving}
        onClick={()=>{void load();}}><RefreshCcw size={15} aria-hidden="true"/>Atualizar</Button>
    </div>
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800">{error}</p>}
    {loading&&<p role="status">Carregando decisões…</p>}
    {canSuggest && data && <div className="space-y-3 rounded-md border border-border p-3">
      <h4 className="font-medium">Registrar sugestão</h4>
      <label className="block space-y-1">
        <span>Feedback de origem</span>
        <select className="w-full rounded border border-border bg-background p-2" value={sourceId}
          onChange={e=>{setSourceId(e.target.value);resetCreateKey();}}>
          <option value="">Selecione uma sessão com feedback confirmado</option>
          {data.sources.map(source=><option value={source.feedbackRevisionId} key={source.feedbackRevisionId}>
            {new Date(source.recordedAt).toLocaleDateString('pt-BR')} • revisão {source.revisionNumber} • {source.scopeKey}
          </option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span>Ação sugerida</span>
        <select className="w-full rounded border border-border bg-background p-2" value={action}
          onChange={e=>{setAction(e.target.value as PostWorkoutDecisionAction);resetCreateKey();}}>
          {Object.entries(actionLabels).map(([id,label])=><option value={id} key={id}>{label}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span>Justificativa profissional</span>
        <textarea rows={2} maxLength={2000} className="w-full rounded border border-border bg-background p-2"
          value={rationale} onChange={e=>{setRationale(e.target.value);resetCreateKey();}}
          placeholder="Relacione a sugestão ao feedback e ao contexto da sessão."/>
      </label>
      <label className="block space-y-1">
        <span>Orientação prática ao aluno (opcional)</span>
        <textarea rows={2} maxLength={500} className="w-full rounded border border-border bg-background p-2"
          value={studentMessage} onChange={e=>{setStudentMessage(e.target.value);resetCreateKey();}}
          placeholder="Escreva uma orientação clara, sem justificativa clínica detalhada."/>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={exposeToStudent} onChange={e=>{setExposeToStudent(e.target.checked);resetCreateKey();}}/>
        Mostrar a orientação ao aluno somente depois da aplicação
      </label>
      <Button type="button" size="sm" onClick={()=>{void suggest();}}
        disabled={saving||!sourceId||!rationale.trim()||(exposeToStudent&&!studentMessage.trim())}>
        Registrar sugestão
      </Button>
    </div>}
    {data && <div className="space-y-3">
      <h4 className="font-medium">Histórico das decisões</h4>
      {!data.decisions.length && <p className="text-muted-foreground">Nenhuma sugestão registrada neste contrato.</p>}
      {data.decisions.map(row=><article key={row.id} className="space-y-2 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>{actionLabels[row.action]} • {statusLabels[row.status]}</strong>
          <span className="text-xs text-muted-foreground">v{row.version} • {new Date(row.suggestedAt).toLocaleDateString('pt-BR')}</span>
        </div>
        <p className="whitespace-pre-wrap">{row.rationale}</p>
        <p className="text-xs text-muted-foreground">Fonte: feedback rev. {row.sourceSnapshot.feedbackRevisionNumber}
          {' • '}{row.sourceSnapshot.scopeKey} • regra {row.sourceSnapshot.ruleSetVersion}
          {' • '}plano {row.trainingPlanId}</p>
        <p className="text-xs text-muted-foreground">
          Sinais observados: {row.sourceSnapshot.signals.map(x=>x.code).join(', ')||'Nenhum sinal registrado'}
        </p>
        {row.approvedAt&&<p className="text-xs">Aprovação: {new Date(row.approvedAt).toLocaleString('pt-BR')}
          {row.approvalReason?' • '+row.approvalReason:''}</p>}
        {row.rejectionReason&&<p className="text-xs text-red-700">Motivo da rejeição: {row.rejectionReason}</p>}
        {row.adjustment&&<p className="text-xs">
          Planejamento v{row.adjustment.version} a partir de {row.adjustment.effectiveFrom}: {row.adjustment.instruction}
        </p>}
        {row.status==='suggested'&&canApprove&&<div className="space-y-2 border-t border-border pt-2">
          <label className="block space-y-1"><span>Motivo (obrigatório para rejeitar)</span>
            <textarea rows={2} maxLength={1000} className="w-full rounded border border-border bg-background p-2"
              value={reviewReason} onChange={e=>{setReviewReason(e.target.value);transitionKeys.current={};}}/>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={()=>{void transition(row,'approve');}}>
              <Check size={15} aria-hidden="true"/>Aprovar
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={saving||!reviewReason.trim()}
              onClick={()=>{void transition(row,'reject');}}>
              <X size={15} aria-hidden="true"/>Rejeitar
            </Button>
          </div>
        </div>}
        {row.status==='approved'&&canApply&&<div className="space-y-2 border-t border-border pt-2">
          <p className="text-xs text-muted-foreground">A aplicação cria uma versão de orientação para o planejamento futuro; não altera treinos já liberados.</p>
          <label className="block space-y-1"><span>Início futuro</span>
            <input type="date" className="w-full rounded border border-border bg-background p-2"
              value={effectiveFrom} onChange={e=>{setEffectiveFrom(e.target.value);transitionKeys.current={};}}/>
          </label>
          <label className="block space-y-1"><span>Alteração de planejamento</span>
            <textarea rows={2} maxLength={2000} className="w-full rounded border border-border bg-background p-2"
              value={instruction} onChange={e=>{setInstruction(e.target.value);transitionKeys.current={};}}/>
          </label>
          <p className="text-xs text-muted-foreground">
            Versão atual de ajustes do plano: {data.planningVersions[row.trainingPlanId]??0}
          </p>
          <Button type="button" size="sm" disabled={saving||!effectiveFrom||!instruction.trim()}
            onClick={()=>{void transition(row,'apply');}}>Aplicar ao planejamento futuro</Button>
        </div>}
      </article>)}
    </div>}
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true"/>
      Nenhuma sugestão altera automaticamente a prescrição, os treinos liberados ou o prontuário.
    </p>
  </section>;
}
