import { useEffect, useId, useRef, useState } from 'react';
import type {
  CanonicalPostWorkoutFeedbackRevisionView,
  CanonicalPostWorkoutFeedbackValues,
  CreateCanonicalPostWorkoutFeedbackPayload,
  TrainingRoutineAudience,
} from '@corrida/types';
import { Button } from '../ui/Button';
import { getPostWorkoutFeedbackSaveFailure } from '../../services/post-workout-feedback.service';

const emptyValues:CanonicalPostWorkoutFeedbackValues={
  pse:null,psr:null,painBefore:null,painDuring:null,painAfter:null,painLocation:null,difficulty:null,
  fatigueLevel:null,energyLevel:null,sleepQuality:null,dizziness:null,observations:null,professorTechnicalNotes:null,
};
const numericFields=[
  ['pse','Esforço percebido (PSE)'],['psr','Recuperação percebida (PSR)'],['painBefore','Dor antes'],
  ['painDuring','Dor durante'],['painAfter','Dor depois'],['difficulty','Dificuldade'],
] as const;
const fatigueLabels={low:'Baixa',medium:'Média',high:'Alta'} as const;
const qualityLabels={good:'Boa',medium:'Média',poor:'Ruim'} as const;

type Props={
  audience:TrainingRoutineAudience;
  initialFeedback:CanonicalPostWorkoutFeedbackRevisionView[];
  save?:(payload:CreateCanonicalPostWorkoutFeedbackPayload)=>Promise<CanonicalPostWorkoutFeedbackRevisionView>;
};
export function PostWorkoutFeedbackCard({audience,initialFeedback,save}:Props){
  const headingId=useId();
  const initial=initialFeedback.find((item)=>item.scopeKey==='session'&&item.current)??null;
  const [feedback,setFeedback]=useState(initial);
  const [values,setValues]=useState<CanonicalPostWorkoutFeedbackValues>(initial?.values??emptyValues);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<{kind:'success'|'error';text:string}|null>(null);
  const pending=useRef<{fingerprint:string;key:string}|null>(null);
  useEffect(()=>{const next=initialFeedback.find((item)=>item.scopeKey==='session'&&item.current)??null;setFeedback(next);setValues(next?.values??emptyValues);},[initialFeedback]);

  if(feedback){
    return <section aria-labelledby={headingId} className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={headingId} className="text-sm font-semibold text-foreground">Feedback pós-treino</h4>
        <span className="text-xs text-muted-foreground">Revisão {feedback.revisionNumber}</span>
      </div>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        {numericFields.map(([key,label])=><div key={key}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium text-foreground">{feedback.values[key]??'Não informado'}</dd></div>)}
        <div><dt className="text-muted-foreground">Fadiga</dt><dd className="font-medium text-foreground">{feedback.values.fatigueLevel?fatigueLabels[feedback.values.fatigueLevel]:'Não informada'}</dd></div>
        <div><dt className="text-muted-foreground">Energia</dt><dd className="font-medium text-foreground">{feedback.values.energyLevel?qualityLabels[feedback.values.energyLevel]:'Não informada'}</dd></div>
        <div><dt className="text-muted-foreground">Sono anterior</dt><dd className="font-medium text-foreground">{feedback.values.sleepQuality?qualityLabels[feedback.values.sleepQuality]:'Não informado'}</dd></div>
        <div><dt className="text-muted-foreground">Tontura</dt><dd className="font-medium text-foreground">{feedback.values.dizziness===null?'Não informado':feedback.values.dizziness?'Sim':'Não'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Local da dor</dt><dd className="font-medium text-foreground">{feedback.values.painLocation||'Não informado'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Observação</dt><dd className="font-medium text-foreground">{feedback.values.observations||'Não informada'}</dd></div>
      </dl>
      {feedback.signals.filter((signal)=>signal.requiresFollowUp).map((signal)=>(
        <div key={signal.code} role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
          {audience==='student'?signal.studentMessage:signal.technicalMessage}
        </div>
      ))}
      {feedback.correctionReason&&<p className="mt-2 text-xs text-muted-foreground">Correção registrada: {feedback.correctionReason}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Feedback confirmado é somente leitura. Correções preservam o histórico.</p>
    </section>;
  }

  if(audience==='professor')return <section aria-labelledby={headingId} className="rounded-lg border border-border bg-muted/20 p-3"><h4 id={headingId} className="text-sm font-semibold text-foreground">Feedback pós-treino</h4><p className="mt-1 text-sm text-muted-foreground">Nenhum feedback confirmado para esta sessão.</p></section>;

  const numeric=(key:(typeof numericFields)[number][0],raw:string)=>{setValues((current)=>({...current,[key]:raw===''?null:Number(raw)}));setMessage(null);};
  const submit=async()=>{if(!save||saving)return;const payloadValues={...values,painLocation:values.painLocation?.trim()||null,observations:values.observations?.trim()||null,professorTechnicalNotes:null};const fingerprint=JSON.stringify(payloadValues);if(!pending.current||pending.current.fingerprint!==fingerprint)pending.current={fingerprint,key:globalThis.crypto?.randomUUID?.()??`feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`};setSaving(true);setMessage(null);try{const saved=await save({operationKey:pending.current.key,values:payloadValues});pending.current=null;setFeedback(saved);setValues(saved.values);setMessage({kind:'success',text:'Feedback confirmado.'});}catch(error){const failure=getPostWorkoutFeedbackSaveFailure(error);setMessage({kind:'error',text:failure.message});}finally{setSaving(false);}};

  return <section aria-labelledby={headingId} className="rounded-lg border border-border bg-muted/20 p-3">
    <h4 id={headingId} className="text-sm font-semibold text-foreground">Como foi seu treino?</h4>
    <p className="mt-1 text-xs text-muted-foreground">Ao confirmar, seu relato fica registrado. Uma correção posterior preserva a versão anterior.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {numericFields.map(([key,label])=><label key={key} className="space-y-1 text-sm"><span className="font-medium text-foreground">{label}</span><input aria-label={label} type="number" min={0} max={10} step={1} value={values[key]??''} disabled={saving} onChange={(event)=>numeric(key,event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2"/><span className="block text-xs text-muted-foreground">Escala de 0 a 10.</span></label>)}
      <label className="space-y-1 text-sm"><span className="font-medium text-foreground">Fadiga</span><select value={values.fatigueLevel??''} disabled={saving} onChange={(event)=>setValues((current)=>({...current,fatigueLevel:(event.target.value||null) as CanonicalPostWorkoutFeedbackValues['fatigueLevel']}))} className="w-full rounded-md border border-input bg-background px-3 py-2"><option value="">Não informar</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label>
      <label className="space-y-1 text-sm"><span className="font-medium text-foreground">Energia</span><select value={values.energyLevel??''} disabled={saving} onChange={(event)=>setValues((current)=>({...current,energyLevel:(event.target.value||null) as CanonicalPostWorkoutFeedbackValues['energyLevel']}))} className="w-full rounded-md border border-input bg-background px-3 py-2"><option value="">Não informar</option><option value="good">Boa</option><option value="medium">Média</option><option value="poor">Ruim</option></select></label>
      <label className="space-y-1 text-sm"><span className="font-medium text-foreground">Sono anterior</span><select value={values.sleepQuality??''} disabled={saving} onChange={(event)=>setValues((current)=>({...current,sleepQuality:(event.target.value||null) as CanonicalPostWorkoutFeedbackValues['sleepQuality']}))} className="w-full rounded-md border border-input bg-background px-3 py-2"><option value="">Não informar</option><option value="good">Bom</option><option value="medium">Médio</option><option value="poor">Ruim</option></select></label>
      <label className="flex items-center gap-2 text-sm sm:self-end sm:pb-2"><input type="checkbox" checked={values.dizziness===true} disabled={saving} onChange={(event)=>setValues((current)=>({...current,dizziness:event.target.checked}))}/><span className="font-medium text-foreground">Senti tontura</span></label>
    </div>
    <label className="mt-3 block space-y-1 text-sm"><span className="font-medium text-foreground">Local da dor ou desconforto</span><input value={values.painLocation??''} maxLength={160} disabled={saving} onChange={(event)=>setValues((current)=>({...current,painLocation:event.target.value}))} className="w-full rounded-md border border-input bg-background px-3 py-2"/></label>
    <label className="mt-3 block space-y-1 text-sm"><span className="font-medium text-foreground">Observação</span><textarea value={values.observations??''} maxLength={1000} rows={3} disabled={saving} onChange={(event)=>setValues((current)=>({...current,observations:event.target.value}))} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2" placeholder="Conte algo importante sobre a execução do treino."/></label>
    <p className="mt-2 text-xs text-muted-foreground">Dor 0–2: faixa verde; 3–4: atenção; acima de 4: acompanhamento. O feedback não altera seu treino automaticamente.</p>
    {message&&<p role={message.kind==='error'?'alert':'status'} className={`mt-3 text-sm ${message.kind==='error'?'text-destructive':'text-foreground'}`}>{message.text}</p>}
    <Button type="button" size="sm" className="mt-3" disabled={saving} onClick={()=>void submit()}>{saving?'Confirmando...':'Confirmar feedback'}</Button>
  </section>;
}
