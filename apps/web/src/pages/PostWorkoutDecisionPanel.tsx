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
type Data={
  decisions:PostWorkoutDecisionView[];planningVersions:Record<string,number>;
  nextCursor:string|null;sources:PostWorkoutDecisionSource[];sourceNextCursor:string|null;
};
type DecisionDraft={reviewReason:string;effectiveFrom:string;instruction:string};
const emptyDecisionDraft:DecisionDraft={reviewReason:'',effectiveFrom:'',instruction:''};
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
  const [loadingMore,setLoadingMore]=useState(false);
  const [loadingSources,setLoadingSources]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [sourceId,setSourceId]=useState('');
  const [action,setAction]=useState<PostWorkoutDecisionAction>('reassess');
  const [rationale,setRationale]=useState('');
  const [studentMessage,setStudentMessage]=useState('');
  const [exposeToStudent,setExposeToStudent]=useState(false);
  const [decisionDrafts,setDecisionDrafts]=useState<Record<string,DecisionDraft>>({});
  const generation=useRef(0);
  const createKey=useRef<string|null>(null);
  const transitionKeys=useRef<Record<string,string>>({});
  const load=useCallback(async()=>{
    if(!canView || !contractId)return;
    const token=++generation.current;
    setLoadingMore(false);
    setLoadingSources(false);
    setLoading(true);
    try{
      const [list,sourcePage]=await Promise.all([
        postWorkoutDecisionService.list(alunoId),
        postWorkoutDecisionService.sources(alunoId),
      ]);
      if(token===generation.current){
        setData({...list,sources:sourcePage.sources,sourceNextCursor:sourcePage.nextCursor});
        setError(null);
      }
    }catch(e){
      if(token===generation.current){setData(null);setError(errorMessage(e));}
    }finally{if(token===generation.current)setLoading(false);}
  },[alunoId,contractId,canView,authorizationKey]);
  useEffect(()=>{
    generation.current++;
    setData(null);setError(null);setSourceId('');setDecisionDrafts({});
    createKey.current=null;transitionKeys.current={};
    if(canView && contractId)void load();
    return ()=>{generation.current++;};
  },[load,canView,contractId]);
  const loadMore=async()=>{
    const cursor=data?.nextCursor;
    if(!cursor||loading||loadingMore||saving)return;
    const token=generation.current;
    setLoadingMore(true);setError(null);
    try{
      const page=await postWorkoutDecisionService.list(alunoId,cursor);
      if(token===generation.current){
        setData(current=>current?{
          ...current,
          decisions:[...current.decisions,...page.decisions.filter(row=>!current.decisions.some(old=>old.id===row.id))],
          planningVersions:{...current.planningVersions,...page.planningVersions},
          nextCursor:page.nextCursor,
        }:null);
      }
    }catch(e){if(token===generation.current)setError(errorMessage(e));}
    finally{if(token===generation.current)setLoadingMore(false);}
  };
  const loadMoreSources=async()=>{
    const cursor=data?.sourceNextCursor;
    if(!cursor||loading||loadingSources||saving)return;
    const token=generation.current;
    setLoadingSources(true);setError(null);
    try{
      const page=await postWorkoutDecisionService.sources(alunoId,cursor);
      if(token===generation.current){
        setData(current=>current?{
          ...current,
          sources:[...current.sources,...page.sources.filter(source=>
            !current.sources.some(previous=>previous.feedbackRevisionId===source.feedbackRevisionId))],
          sourceNextCursor:page.nextCursor,
        }:null);
      }
    }catch(e){if(token===generation.current)setError(errorMessage(e));}
    finally{if(token===generation.current)setLoadingSources(false);}
  };
  const resetCreateKey=()=>{createKey.current=null;};
  const updateDecisionDraft=(decisionId:string,patch:Partial<DecisionDraft>)=>{
    setDecisionDrafts(current=>({...current,
      [decisionId]:{...emptyDecisionDraft,...current[decisionId],...patch},
    }));
    // Changing one decision must not invalidate retries of another decision.
    for(const kind of ['approve','reject','apply'] as const){
      delete transitionKeys.current[decisionId+':'+kind];
    }
  };
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
    const draft=decisionDrafts[row.id]??emptyDecisionDraft;
    setSaving(true);setError(null);
    const k=row.id+':'+kind;
    transitionKeys.current[k] ||=nextKey();
    try{
      const payload={operationKey:transitionKeys.current[k],expectedVersion:row.version};
      if(kind==='apply'){
        await postWorkoutDecisionService.transition(alunoId,row.id,kind,{
          ...payload,expectedPlanningVersion:data?.planningVersions[row.trainingPlanId]??0,
          effectiveFrom:draft.effectiveFrom,instruction:draft.instruction,
        });
      }else{
        await postWorkoutDecisionService.transition(alunoId,row.id,kind,{
          ...payload,reason:draft.reviewReason.trim()||undefined,
        });
      }
      for(const action of ['approve','reject','apply'] as const){
        delete transitionKeys.current[row.id+':'+action];
      }
      setDecisionDrafts(current=>{
        if(!(row.id in current))return current;
        const next={...current};delete next[row.id];return next;
      });
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
      {data.sourceNextCursor&&<Button type="button" size="sm" variant="outline"
        disabled={loading||loadingSources||saving} onClick={()=>{void loadMoreSources();}}>
        {loadingSources?'Carregando fontes anteriores…':'Carregar mais sessões com feedback'}
      </Button>}
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
              value={decisionDrafts[row.id]?.reviewReason??''}
              onChange={e=>updateDecisionDraft(row.id,{reviewReason:e.target.value})}/>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={()=>{void transition(row,'approve');}}>
              <Check size={15} aria-hidden="true"/>Aprovar
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={saving||!decisionDrafts[row.id]?.reviewReason?.trim()}
              onClick={()=>{void transition(row,'reject');}}>
              <X size={15} aria-hidden="true"/>Rejeitar
            </Button>
          </div>
        </div>}
        {row.status==='approved'&&canApply&&<div className="space-y-2 border-t border-border pt-2">
          <p className="text-xs text-muted-foreground">A aplicação cria uma versão de orientação para o planejamento futuro; não altera treinos já liberados.</p>
          <label className="block space-y-1"><span>Início futuro</span>
            <input type="date" className="w-full rounded border border-border bg-background p-2"
              value={decisionDrafts[row.id]?.effectiveFrom??''}
              onChange={e=>updateDecisionDraft(row.id,{effectiveFrom:e.target.value})}/>
          </label>
          <label className="block space-y-1"><span>Alteração de planejamento</span>
            <textarea rows={2} maxLength={2000} className="w-full rounded border border-border bg-background p-2"
              value={decisionDrafts[row.id]?.instruction??''}
              onChange={e=>updateDecisionDraft(row.id,{instruction:e.target.value})}/>
          </label>
          <p className="text-xs text-muted-foreground">
            Versão atual de ajustes do plano: {data.planningVersions[row.trainingPlanId]??0}
          </p>
          <Button type="button" size="sm" disabled={saving||!decisionDrafts[row.id]?.effectiveFrom||!decisionDrafts[row.id]?.instruction?.trim()}
            onClick={()=>{void transition(row,'apply');}}>Aplicar ao planejamento futuro</Button>
        </div>}
      </article>)}
      {data.nextCursor&&<Button type="button" size="sm" variant="outline"
        disabled={loading||loadingMore||saving}
        onClick={()=>{void loadMore();}}>
        {loadingMore?'Carregando decisões anteriores…':'Carregar decisões anteriores'}
      </Button>}
    </div>}
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true"/>
      Nenhuma sugestão altera automaticamente a prescrição, os treinos liberados ou o prontuário.
    </p>
  </section>;
}
