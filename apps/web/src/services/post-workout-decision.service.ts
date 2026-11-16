import type {
  ApplyPostWorkoutDecisionPayload, CreatePostWorkoutDecisionPayload,
  PostWorkoutDecisionSourcePage, PostWorkoutDecisionStudentNotice,
  PostWorkoutDecisionView, TransitionPostWorkoutDecisionPayload,
} from '@corrida/types';
import api from './api';

type ApiEnvelope<T> = { success:boolean;data:T;message?:string };
const root='/training-decisions';
export const postWorkoutDecisionService={
  async list(alunoId:string,cursor?:string) {
    const url=root+'/alunos/'+encodeURIComponent(alunoId)
      +(cursor?'?cursor='+encodeURIComponent(cursor):'');
    const response=await api.get<ApiEnvelope<{
      decisions:PostWorkoutDecisionView[];
      planningVersions:Record<string,number>;
      nextCursor:string|null;
    }>>(url);
    return response.data.data;
  },
  async sources(alunoId:string,cursor?:string) {
    const url=root+'/alunos/'+encodeURIComponent(alunoId)+'/sources'
      +(cursor?'?cursor='+encodeURIComponent(cursor):'');
    const response=await api.get<ApiEnvelope<PostWorkoutDecisionSourcePage>>(url);
    return response.data.data;
  },
  async suggest(alunoId:string,payload:CreatePostWorkoutDecisionPayload) {
    const response=await api.post<ApiEnvelope<PostWorkoutDecisionView>>(
      root+'/alunos/'+encodeURIComponent(alunoId),payload
    );
    return response.data.data;
  },
  async transition(alunoId:string,decisionId:string,action:'approve'|'reject'|'apply',
    payload:TransitionPostWorkoutDecisionPayload|ApplyPostWorkoutDecisionPayload) {
    const response=await api.post<ApiEnvelope<PostWorkoutDecisionView>>(
      root+'/alunos/'+encodeURIComponent(alunoId)+'/'+encodeURIComponent(decisionId)+'/'+action,payload
    );
    return response.data.data;
  },
  async notices(contractId?:string) {
    const response=await api.get<ApiEnvelope<PostWorkoutDecisionStudentNotice[]>>(
      root+'/student/me',contractId?{headers:{'x-contract-id':contractId}}:undefined
    );
    return response.data.data;
  },
};
