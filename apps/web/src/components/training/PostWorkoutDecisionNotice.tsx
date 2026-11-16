import { useEffect, useRef, useState } from 'react';
import type { PostWorkoutDecisionStudentNotice } from '@corrida/types';
import { postWorkoutDecisionService } from '../../services/post-workout-decision.service';

/** Student-only projection: never loads professor rationale, evidence or pending suggestions. */
export function PostWorkoutDecisionNotice({contractId}:{contractId?:string}){
  const [notices,setNotices]=useState<PostWorkoutDecisionStudentNotice[]>([]);
  const [failed,setFailed]=useState(false);
  const generation=useRef(0);
  useEffect(()=>{
    const id=++generation.current;
    setNotices([]);setFailed(false);
    void postWorkoutDecisionService.notices(contractId).then(rows=>{
      if(id===generation.current)setNotices(rows);
    }).catch(()=>{
      if(id===generation.current)setFailed(true);
    });
    return ()=>{generation.current++;};
  },[contractId]);
  if(failed)return <p className="text-sm text-muted-foreground" role="status">
    Não foi possível consultar orientações recentes. Você pode continuar acessando seu treino.
  </p>;
  if(!notices.length)return null;
  return <section aria-label="Orientações aprovadas de treino" className="rounded-lg border border-border bg-background p-4">
    <h2 className="text-base font-semibold">Orientações do professor</h2>
    <p className="mt-1 text-sm text-muted-foreground">
      Estas orientações foram aplicadas pelo professor ao planejamento futuro. Seus treinos liberados não foram alterados.
    </p>
    <ul className="mt-3 space-y-2">
      {notices.map(n=><li key={n.id} className="rounded-md border border-border p-3 text-sm">
        <p>{n.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Registrada em {new Date(n.appliedAt).toLocaleDateString('pt-BR')}
        </p>
      </li>)}
    </ul>
  </section>;
}
