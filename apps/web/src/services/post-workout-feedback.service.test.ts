import { getPostWorkoutFeedbackSaveFailure } from './post-workout-feedback.service';
describe('post workout feedback service (#390)',()=>{
  it('preserva mensagem recuperável sem apagar rascunho local',()=>{expect(getPostWorkoutFeedbackSaveFailure({response:{status:503}})).toEqual({kind:'temporary',message:'Não foi possível confirmar o feedback. Seus dados continuam nesta tela para você tentar novamente.'});});
  it('distingue conflito de feedback já confirmado',()=>{expect(getPostWorkoutFeedbackSaveFailure({response:{status:409,data:{details:{code:'POST_WORKOUT_FEEDBACK_ALREADY_CONFIRMED'}}}}).kind).toBe('already-confirmed');});
});
