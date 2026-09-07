import {
  buildAnthropometryCompletionSnapshot,
  evaluateAnthropometryCompletionRequirements,
} from './anthropometry-completion.service.js';

describe('anthropometry completion requirements', () => {
  const requirements = [
    { segmentId: 'waist', version: 2 },
    { segmentId: 'hip', version: 4 },
  ];
  const segments = [
    { id: 'waist', name: 'Cintura', active: true },
    { id: 'hip', name: 'Quadril', active: true },
  ];

  it('reports only explicitly required measurements that are missing', () => {
    expect(
      evaluateAnthropometryCompletionRequirements(requirements, segments, [
        { segmentId: 'waist', value: '80,5' },
        { segmentId: 'hip', value: '   ' },
        { segmentId: 'optional', value: '' },
      ])
    ).toEqual([{ segmentId: 'hip', name: 'Quadril' }]);
  });

  it('does not infer optional or principal segment types as completion requirements', () => {
    expect(
      evaluateAnthropometryCompletionRequirements([], segments, [
        { segmentId: 'waist', value: '' },
        { segmentId: 'hip', value: '' },
      ])
    ).toEqual([]);
  });

  it('blocks a required segment that became inactive instead of silently dropping the rule', () => {
    expect(
      evaluateAnthropometryCompletionRequirements(
        [{ segmentId: 'waist', version: 3 }],
        [{ id: 'waist', name: 'Cintura', active: false }],
        [{ segmentId: 'waist', value: '80' }]
      )
    ).toEqual([{ segmentId: 'waist', name: 'Cintura' }]);
  });

  it('captures requirement versions so later configuration changes cannot rewrite history', () => {
    expect(
      buildAnthropometryCompletionSnapshot(requirements, segments, '2026-09-02T03:30:00.000Z')
    ).toEqual({
      legacy: false,
      configurationDefined: true,
      capturedAt: '2026-09-02T03:30:00.000Z',
      requiredSegments: [
        { segmentId: 'waist', name: 'Cintura', requirementVersion: 2 },
        { segmentId: 'hip', name: 'Quadril', requirementVersion: 4 },
      ],
    });
  });
});
