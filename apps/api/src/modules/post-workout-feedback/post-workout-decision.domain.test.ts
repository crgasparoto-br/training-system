import { canExposePostWorkoutDecision, canTransitionDecision, isFuturePlanningDate } from './post-workout-decision.domain.js';

describe('issue #406 canonical decision state machine',()=>{
  it.each([
    ['suggested',1,'approve',true],
    ['suggested',1,'reject',true],
    ['suggested',1,'apply',false],
    ['approved',2,'apply',true],
    ['approved',2,'reject',false],
    ['approved',2,'approve',false],
    ['rejected',2,'apply',false],
    ['rejected',2,'approve',false],
    ['applied',3,'approve',false],
    ['applied',3,'apply',false],
  ] as const)('transition %s v%d -> %s permitted=%s',(status,version,action,expected)=>{
    expect(canTransitionDecision(status,version,action,version)).toBe(expected);
  });
  it('rejects stale, missing, fractional, and negative versions',()=>{
    expect(canTransitionDecision('suggested',2,'approve',1)).toBe(false);
    expect(canTransitionDecision('suggested',1,'approve',0)).toBe(false);
    expect(canTransitionDecision('approved',2,'apply',2.5)).toBe(false);
    expect(canTransitionDecision('approved',2,'apply',-1)).toBe(false);
  });
  it('keeps suggestions, approvals and rejections invisible to the student',()=>{
    for(const status of ['suggested','approved','rejected'] as const){
      expect(canExposePostWorkoutDecision(status,true,'Mensagem')).toBe(false);
    }
    expect(canExposePostWorkoutDecision('applied',false,'Mensagem')).toBe(false);
    expect(canExposePostWorkoutDecision('applied',true,null)).toBe(false);
    expect(canExposePostWorkoutDecision('applied',true,' ')).toBe(false);
    expect(canExposePostWorkoutDecision('applied',true,'Orientação prática')).toBe(true);
  });
  it('only accepts dates strictly after the current UTC civil day',()=>{
    const now=new Date('2026-11-16T23:59:59.000Z');
    expect(isFuturePlanningDate(new Date('2026-11-16T00:00:00.000Z'),now)).toBe(false);
    expect(isFuturePlanningDate(new Date('2026-11-17T00:00:00.000Z'),now)).toBe(true);
    expect(isFuturePlanningDate(new Date('2026-11-18T00:00:00.000Z'),now)).toBe(true);
  });
});
