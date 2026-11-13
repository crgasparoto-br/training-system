import { ExerciseCurationStatus } from '@prisma/client';
import {
  LibraryCurationError, assertExerciseCanBeApproved, nextExerciseStatus,
} from '../src/modules/library/library-curation.domain';

const exercise = {
  name: 'Agachamento',
  category: 'RESISTIDO',
  capacity: 'resisted',
  instructions: ['Posicionar os pés', 'Controlar o movimento'],
  videoUrl: null as string | null,
  mediaOrigin: null as string | null,
  mediaLicense: null as string | null,
};

describe('issue #394: curation domain', () => {
  it('does not publish a draft directly', () => {
    expect(() => nextExerciseStatus(ExerciseCurationStatus.draft, 'approve'))
      .toThrow(LibraryCurationError);
    expect(nextExerciseStatus(ExerciseCurationStatus.draft, 'submit'))
      .toBe(ExerciseCurationStatus.in_review);
    expect(nextExerciseStatus(ExerciseCurationStatus.in_review, 'approve'))
      .toBe(ExerciseCurationStatus.approved);
  });

  it('requires an explicit review before returning an inactive item to the official catalog', () => {
    expect(nextExerciseStatus(ExerciseCurationStatus.approved, 'deactivate'))
      .toBe(ExerciseCurationStatus.inactive);
    expect(nextExerciseStatus(ExerciseCurationStatus.inactive, 'reopen'))
      .toBe(ExerciseCurationStatus.draft);
    expect(() => nextExerciseStatus(ExerciseCurationStatus.inactive, 'approve')).toThrow();
  });

  it('rejects empty technical instructions or missing capacity', () => {
    expect(() => assertExerciseCanBeApproved({ ...exercise, capacity: null })).toThrow();
    expect(() => assertExerciseCanBeApproved({ ...exercise, instructions: [] })).toThrow();
    expect(() => assertExerciseCanBeApproved({ ...exercise, capacity: 'resistance' })).toThrow();
    expect(() => assertExerciseCanBeApproved({ ...exercise, capacity: 'custom' })).toThrow();
    for (const capacity of ['resisted', 'flexibility', 'cyclic', 'balance']) {
      expect(() => assertExerciseCanBeApproved({ ...exercise, capacity })).not.toThrow();
    }
  });

  it('requires source and license for externally linked media, never infers either', () => {
    const withVideo = { ...exercise, videoUrl: 'https://example.com/demo' };
    expect(() => assertExerciseCanBeApproved(withVideo)).toThrow();
    expect(() => assertExerciseCanBeApproved({
      ...withVideo, mediaOrigin: 'Equipe própria', mediaLicense: 'Uso autorizado',
    })).not.toThrow();
  });

  it('does not invent media provenance when an exercise has no media', () => {
    expect(() => assertExerciseCanBeApproved(exercise)).not.toThrow();
  });
});
