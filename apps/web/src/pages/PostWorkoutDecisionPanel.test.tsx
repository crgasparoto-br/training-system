// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostWorkoutDecisionView } from '@corrida/types';
import { postWorkoutDecisionService } from '../services/post-workout-decision.service';
import { PostWorkoutDecisionPanel } from './PostWorkoutDecisionPanel';

vi.mock('../services/post-workout-decision.service', () => ({
  postWorkoutDecisionService: {
    list: vi.fn(), sources: vi.fn(), suggest: vi.fn(), transition: vi.fn(),
  },
}));

const props = {
  alunoId: 'student-406', contractId: 'contract-406', authorizationKey: 'granted',
  canView: true, canSuggest: true, canApprove: true, canApply: true,
};
const decision = (id: string): PostWorkoutDecisionView => ({
  id, alunoId: props.alunoId, contractId: props.contractId,
  workoutDayId: 'day-406', sourceFeedbackRevisionId: 'revision-406',
  trainingPlanId: 'plan-406', action: 'maintain', rationale: 'Justificativa ' + id,
  status: 'suggested', version: 1, suggestedAt: '2026-11-16T12:00:00Z',
  suggestedByProfessorId: 'professor-406', approvedAt: null, approvedByProfessorId: null,
  approvalReason: null, rejectedAt: null, rejectedByProfessorId: null,
  rejectionReason: null, appliedAt: null, appliedByProfessorId: null,
  studentMessage: null, exposeToStudent: false, adjustment: null,
  sourceSnapshot: {
    feedbackRevisionNumber: 1, scopeKey: 'session', ruleSetVersion: 'v1',
    recordedAt: '2026-11-16T12:00:00Z', originReleaseId: 'release-406',
    values: {
      pse: null, psr: null, painBefore: null, painDuring: null, painAfter: null,
      painLocation: null, difficulty: null, fatigueLevel: null, energyLevel: null,
      sleepQuality: null, dizziness: null, observations: null, professorTechnicalNotes: null,
    }, signals: [],
  },
});

const approvedDecision=(id:string):PostWorkoutDecisionView=>({
  ...decision(id),status:'approved',version:2,
  approvedAt:'2026-11-16T13:00:00Z',approvedByProfessorId:'professor-406',
});
const article=(id:string)=>{
  const element=screen.getByText('Justificativa '+id).closest('article');
  if(!element)throw new Error('Decisao '+id+' sem formulario');
  return within(element);
};

beforeEach(() => {
  vi.mocked(postWorkoutDecisionService.list).mockReset();
  vi.mocked(postWorkoutDecisionService.sources).mockReset();
  vi.mocked(postWorkoutDecisionService.list).mockResolvedValue({
    decisions: [decision('first')], planningVersions: {}, nextCursor: null,
  });
  vi.mocked(postWorkoutDecisionService.sources).mockResolvedValue({
    sources: [], nextCursor: null,
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('professional post-workout decision panel', () => {
  it('loads older decisions by cursor without duplicating an existing decision', async () => {
    vi.mocked(postWorkoutDecisionService.list)
      .mockResolvedValueOnce({ decisions: [decision('first')], planningVersions: {}, nextCursor: 'cursor-first' })
      .mockResolvedValueOnce({
        decisions: [decision('first'), decision('older')], planningVersions: {}, nextCursor: null,
      });
    render(<PostWorkoutDecisionPanel {...props} />);
    expect(await screen.findByText('Justificativa first')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar decisões anteriores' }));
    expect(await screen.findByText('Justificativa older')).toBeInTheDocument();
    expect(screen.getAllByText('Justificativa first')).toHaveLength(1);
    expect(postWorkoutDecisionService.list).toHaveBeenCalledWith('student-406', 'cursor-first');
  });

  it('loads older feedback sources so a large revision history cannot hide sessions', async () => {
    vi.mocked(postWorkoutDecisionService.sources).mockReset();
    vi.mocked(postWorkoutDecisionService.sources)
      .mockResolvedValueOnce({ sources: [{
        workoutDayId: 'day-a', feedbackRevisionId: 'revision-a', scopeKey: 'session',
        revisionNumber: 1, recordedAt: '2026-11-16T10:00:00Z', signals: [],
      }], nextCursor: 'revision-a' })
      .mockResolvedValueOnce({ sources: [{
        workoutDayId: 'day-b', feedbackRevisionId: 'revision-b', scopeKey: 'capacity:resisted',
        revisionNumber: 2, recordedAt: '2026-11-15T10:00:00Z', signals: [],
      }], nextCursor: null });
    render(<PostWorkoutDecisionPanel {...props} />);
    expect(await screen.findByRole('option', { name: /revisão 1/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais sessões com feedback' }));
    expect(await screen.findByRole('option', { name: /revisão 2/ })).toBeInTheDocument();
    expect(postWorkoutDecisionService.sources).toHaveBeenCalledWith('student-406', 'revision-a');
  });

  it('keeps rejection reasons isolated and sends only the selected decision reason',async()=>{
    vi.mocked(postWorkoutDecisionService.list).mockResolvedValue({
      decisions:[decision('first'),decision('second')],planningVersions:{},nextCursor:null,
    });
    vi.mocked(postWorkoutDecisionService.transition).mockResolvedValue(decision('second'));
    render(<PostWorkoutDecisionPanel {...props}/>);
    expect(await screen.findByText('Justificativa second')).toBeInTheDocument();
    const first=article('first'),second=article('second');
    const firstReason=first.getByRole('textbox',{name:/Motivo/});
    const secondReason=second.getByRole('textbox',{name:/Motivo/});
    fireEvent.change(firstReason,{target:{value:'Motivo apenas da primeira decisao'}});
    expect(secondReason).toHaveValue('');
    expect(second.getByRole('button',{name:'Rejeitar'})).toBeDisabled();
    fireEvent.change(secondReason,{target:{value:'Motivo exclusivo da segunda decisao'}});
    expect(firstReason).toHaveValue('Motivo apenas da primeira decisao');
    fireEvent.click(second.getByRole('button',{name:'Rejeitar'}));
    await waitFor(()=>expect(postWorkoutDecisionService.transition).toHaveBeenCalledTimes(1));
    expect(postWorkoutDecisionService.transition).toHaveBeenCalledWith(
      props.alunoId,'second','reject',expect.objectContaining({
        expectedVersion:1,reason:'Motivo exclusivo da segunda decisao',
      }),
    );
  });

  it('preserves the other approval draft after submitting the first decision',async()=>{
    vi.mocked(postWorkoutDecisionService.list).mockResolvedValue({
      decisions:[decision('first'),decision('second')],planningVersions:{},nextCursor:null,
    });
    vi.mocked(postWorkoutDecisionService.transition).mockResolvedValue(approvedDecision('first'));
    render(<PostWorkoutDecisionPanel {...props}/>);
    expect(await screen.findByText('Justificativa second')).toBeInTheDocument();
    fireEvent.change(article('first').getByRole('textbox',{name:/Motivo/}),{
      target:{value:'Aprovacao da primeira'},
    });
    fireEvent.change(article('second').getByRole('textbox',{name:/Motivo/}),{
      target:{value:'Aprovacao da segunda'},
    });
    fireEvent.click(article('first').getByRole('button',{name:'Aprovar'}));
    await waitFor(()=>expect(postWorkoutDecisionService.transition).toHaveBeenCalledWith(
      props.alunoId,'first','approve',expect.objectContaining({
        expectedVersion:1,reason:'Aprovacao da primeira',
      }),
    ));
    await waitFor(()=>expect(article('second').getByRole('textbox',{name:/Motivo/}))
      .toHaveValue('Aprovacao da segunda'));
    await waitFor(()=>expect(article('second').getByRole('button',{name:'Aprovar'}))
      .not.toBeDisabled());
    fireEvent.click(article('second').getByRole('button',{name:'Aprovar'}));
    await waitFor(()=>expect(postWorkoutDecisionService.transition).toHaveBeenCalledTimes(2));
    expect(postWorkoutDecisionService.transition).toHaveBeenLastCalledWith(
      props.alunoId,'second','approve',expect.objectContaining({
        expectedVersion:1,reason:'Aprovacao da segunda',
      }),
    );
  });

  it('never applies the date and instruction of one approved decision to another',async()=>{
    vi.mocked(postWorkoutDecisionService.list).mockResolvedValue({
      decisions:[approvedDecision('first'),approvedDecision('second')],
      planningVersions:{'plan-406':3},nextCursor:null,
    });
    vi.mocked(postWorkoutDecisionService.transition).mockResolvedValue(approvedDecision('second'));
    render(<PostWorkoutDecisionPanel {...props}/>);
    expect(await screen.findByText('Justificativa second')).toBeInTheDocument();
    fireEvent.change(article('first').getByLabelText(/In.cio futuro/),{
      target:{value:'2026-12-20'},
    });
    fireEvent.change(article('first').getByLabelText(/Altera..o de planejamento/),{
      target:{value:'Instrucoes exclusivas da primeira'},
    });
    expect(article('second').getByLabelText(/In.cio futuro/)).toHaveValue('');
    expect(article('second').getByRole('button',{name:'Aplicar ao planejamento futuro'}))
      .toBeDisabled();
    fireEvent.change(article('second').getByLabelText(/In.cio futuro/),{
      target:{value:'2026-12-25'},
    });
    fireEvent.change(article('second').getByLabelText(/Altera..o de planejamento/),{
      target:{value:'Instrucoes exclusivas da segunda'},
    });
    expect(article('first').getByLabelText(/In.cio futuro/)).toHaveValue('2026-12-20');
    expect(article('first').getByLabelText(/Altera..o de planejamento/))
      .toHaveValue('Instrucoes exclusivas da primeira');
    fireEvent.click(article('second').getByRole('button',{name:'Aplicar ao planejamento futuro'}));
    await waitFor(()=>expect(postWorkoutDecisionService.transition).toHaveBeenCalledTimes(1));
    expect(postWorkoutDecisionService.transition).toHaveBeenCalledWith(
      props.alunoId,'second','apply',expect.objectContaining({
        expectedVersion:2,expectedPlanningVersion:3,effectiveFrom:'2026-12-25',
        instruction:'Instrucoes exclusivas da segunda',
      }),
    );
  });


  it('discards an older pending student response after changing student and contract', async () => {
    type DecisionPage = Awaited<ReturnType<typeof postWorkoutDecisionService.list>>;
    let resolveOlder!: (page: DecisionPage) => void;
    const older = new Promise<DecisionPage>(resolve => { resolveOlder = resolve; });
    vi.mocked(postWorkoutDecisionService.list)
      .mockReturnValueOnce(older)
      .mockResolvedValueOnce({
        decisions: [{...decision('new'), alunoId: 'student-b', contractId: 'contract-b'}],
        planningVersions: {}, nextCursor: null,
      });
    const view = render(<PostWorkoutDecisionPanel {...props} />);
    await waitFor(() => expect(postWorkoutDecisionService.list).toHaveBeenCalledTimes(1));
    view.rerender(<PostWorkoutDecisionPanel {...props}
      alunoId="student-b" contractId="contract-b" authorizationKey="granted-b" />);
    expect(await screen.findByText('Justificativa new')).toBeInTheDocument();
    await act(async () => {
      resolveOlder({decisions:[decision('older')], planningVersions:{}, nextCursor:null});
    });
    expect(screen.queryByText('Justificativa older')).toBeNull();
    expect(postWorkoutDecisionService.list).toHaveBeenNthCalledWith(2,'student-b');
  });

  it('discards pending clinical data when permission is revoked during a request', async () => {
    type DecisionPage = Awaited<ReturnType<typeof postWorkoutDecisionService.list>>;
    let resolvePending!: (page: DecisionPage) => void;
    vi.mocked(postWorkoutDecisionService.list).mockReturnValueOnce(
      new Promise<DecisionPage>(resolve => { resolvePending = resolve; }),
    );
    const view = render(<PostWorkoutDecisionPanel {...props} />);
    await waitFor(() => expect(postWorkoutDecisionService.list).toHaveBeenCalledTimes(1));
    view.rerender(<PostWorkoutDecisionPanel {...props}
      canView={false} canSuggest={false} canApprove={false} canApply={false}
      authorizationKey="revoked-during-load" />);
    await act(async () => {
      resolvePending({decisions:[decision('private')], planningVersions:{}, nextCursor:null});
    });
    expect(screen.queryByText('Justificativa private')).toBeNull();
    expect(screen.queryByRole('region', {name:'Decisões pós-treino'})).toBeNull();
  });

  it('clears stale clinical data on a failed refresh and can retry safely', async () => {
    vi.mocked(postWorkoutDecisionService.list)
      .mockResolvedValueOnce({decisions:[decision('first')],planningVersions:{},nextCursor:null})
      .mockRejectedValueOnce(new Error('temporary network outage'))
      .mockResolvedValueOnce({decisions:[decision('recovered')],planningVersions:{},nextCursor:null});
    render(<PostWorkoutDecisionPanel {...props} />);
    expect(await screen.findByText('Justificativa first')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Atualizar'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir esta operação');
    expect(screen.queryByText('Justificativa first')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Atualizar'}));
    expect(await screen.findByText('Justificativa recovered')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(postWorkoutDecisionService.list).toHaveBeenCalledTimes(3);
  });

  it('retries a failed approval with the same operation key, without duplicating the intention', async () => {
    vi.mocked(postWorkoutDecisionService.transition)
      .mockRejectedValueOnce(new Error('response lost after commit'))
      .mockResolvedValueOnce(approvedDecision('first'));
    render(<PostWorkoutDecisionPanel {...props} />);
    expect(await screen.findByText('Justificativa first')).toBeInTheDocument();
    fireEvent.change(article('first').getByRole('textbox',{name:/Motivo/}),{
      target:{value:'Aprovação mantida no retry'},
    });
    fireEvent.click(article('first').getByRole('button',{name:'Aprovar'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir esta operação');
    fireEvent.click(article('first').getByRole('button',{name:'Aprovar'}));
    await waitFor(() => expect(postWorkoutDecisionService.transition).toHaveBeenCalledTimes(2));
    const calls=vi.mocked(postWorkoutDecisionService.transition).mock.calls;
    expect(calls[0]?.[0]).toBe(props.alunoId);
    expect(calls[0]?.[1]).toBe('first');
    expect(calls[0]?.[2]).toBe('approve');
    expect(calls[0]?.[3]).toMatchObject({
      reason:'Aprovação mantida no retry',expectedVersion:1,
    });
    expect(calls[0]?.[3].operationKey).toBe(calls[1]?.[3].operationKey);
  });

  it('hides cached clinical decisions immediately after permission revocation', async () => {
    const view = render(<PostWorkoutDecisionPanel {...props} />);
    expect(await screen.findByText('Justificativa first')).toBeInTheDocument();
    view.rerender(<PostWorkoutDecisionPanel {...props}
      canView={false} canSuggest={false} canApprove={false} canApply={false}
      authorizationKey="revoked" />);
    expect(screen.queryByText('Justificativa first')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Decisões pós-treino' })).toBeNull();
    await waitFor(() => expect(postWorkoutDecisionService.list).toHaveBeenCalledTimes(1));
  });
});
