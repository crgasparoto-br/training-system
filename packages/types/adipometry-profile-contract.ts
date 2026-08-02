import type {
  AdipometryProtocolDefinitionSnapshot,
  AdipometryProtocolPopulation,
} from './adipometry.js';

/** Canonical values emitted by the persisted student profile resolver. */
export type AdipometryCanonicalSex = 'MALE' | 'FEMALE' | 'OTHER';

/**
 * Machine-enforced maturation eligibility. `maturationCriteria` remains the
 * human-readable clinical description; this rule is the executable contract.
 */
export type AdipometryMaturationRule =
  | {
      mode: 'NOT_REQUIRED';
    }
  | {
      mode: 'REQUIRED';
      allowedValues: string[];
    };

export interface AdipometryCanonicalProtocolPopulation
  extends Omit<AdipometryProtocolPopulation, 'sexCriteria'> {
  sexCriteria: AdipometryCanonicalSex[];
  maturationRule: AdipometryMaturationRule;
}

/**
 * Definition accepted by the final ADPT approval gate. This type narrows the
 * legacy structural contract to values reproducible from canonical student
 * records during assessment completion.
 */
export interface AdipometryCanonicalProtocolDefinitionSnapshot
  extends Omit<AdipometryProtocolDefinitionSnapshot, 'population'> {
  population: AdipometryCanonicalProtocolPopulation;
}

export type AdipometryCanonicalProfileIncompatibilityCode =
  | 'SEX_NOT_APPLICABLE'
  | 'MATURATION_REQUIRED'
  | 'MATURATION_NOT_APPLICABLE'
  | 'CANONICAL_PROFILE_INVALID';
