import type { CanonicalPostWorkoutFeedbackRevisionView, CreateCanonicalPostWorkoutFeedbackPayload } from '@corrida/types';
import api from './api';

type ApiEnvelope<T>={success:boolean;data:T;message?:string};
export const postWorkoutFeedbackService={
  async saveForStudent(sessionId:string,payload:CreateCanonicalPostWorkoutFeedbackPayload,options:{contractId?:string}={}):Promise<CanonicalPostWorkoutFeedbackRevisionView>{
    const response=await api.post<ApiEnvelope<CanonicalPostWorkoutFeedbackRevisionView>>(
      `/student/me/training-sessions/${encodeURIComponent(sessionId)}/feedback`,
      payload,
      options.contractId?{headers:{'x-contract-id':options.contractId}}:undefined
    );
    return response.data.data;
  },
};
type Failure={kind:'not-terminal'|'already-confirmed'|'conflict'|'invalid'|'temporary';message:string};
type ErrorLike={response?:{status?:number;data?:{error?:unknown;message?:unknown;details?:{code?:unknown}}}};
export function getPostWorkoutFeedbackSaveFailure(error:unknown):Failure{
  const response=(error as ErrorLike|null)?.response;const body=response?.data;const code=body?.details?.code;
  const message=typeof body?.error==='string'?body.error.trim():typeof body?.message==='string'?body.message.trim():'';
  if(response?.status===409&&code==='POST_WORKOUT_FEEDBACK_SESSION_NOT_TERMINAL')return{kind:'not-terminal',message:'O treino ainda não foi concluído ou encerrado como parcial.'};
  if(response?.status===409&&code==='POST_WORKOUT_FEEDBACK_ALREADY_CONFIRMED')return{kind:'already-confirmed',message:'Este feedback já foi confirmado e está somente leitura.'};
  if(response?.status===409)return{kind:'conflict',message:message||'O feedback mudou em outro dispositivo. Atualize a tela antes de tentar novamente.'};
  if(response?.status===400)return{kind:'invalid',message:message||'Revise os dados do feedback e tente novamente.'};
  return{kind:'temporary',message:'Não foi possível confirmar o feedback. Seus dados continuam nesta tela para você tentar novamente.'};
}
