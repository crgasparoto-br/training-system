import { useEffect, useState, type ReactNode } from 'react';
import {
  PRE_REGISTRATION_DISABLED_EVENT,
  isPreRegistrationDisabledResponse,
} from '../config/pre-registration-availability';
import api from '../services/api';
import {
  PreRegistrationUnavailable,
  type PreRegistrationAudience,
} from './PreRegistrationUnavailable';

type Availability = 'checking' | 'enabled' | 'disabled';

interface PreRegistrationAvailabilityBoundaryProps {
  audience: PreRegistrationAudience;
  children: ReactNode;
}

export function PreRegistrationAvailabilityBoundary({
  audience,
  children,
}: PreRegistrationAvailabilityBoundaryProps) {
  const [availability, setAvailability] = useState<Availability>('checking');

  useEffect(() => {
    let active = true;
    const markDisabled = () => {
      if (active) setAvailability('disabled');
    };

    window.addEventListener(PRE_REGISTRATION_DISABLED_EVENT, markDisabled);

    // Probe before exposing any route consumer in both explicit-origin and
    // same-origin deployments. The canonical endpoint returns only 204 when
    // enabled or 503 PRE_REGISTRATION_DISABLED when disabled. Every other
    // response and every transport failure is unknown availability and remains
    // fail-closed.
    api
      .get('/pre-registration/availability', { validateStatus: () => true })
      .then((response) => {
        if (!active) return;
        const enabled =
          response.status === 204 &&
          !isPreRegistrationDisabledResponse(response.status, response.data);
        setAvailability(enabled ? 'enabled' : 'disabled');
      })
      .catch(() => {
        if (active) setAvailability('disabled');
      });

    return () => {
      active = false;
      window.removeEventListener(PRE_REGISTRATION_DISABLED_EVENT, markDisabled);
    };
  }, []);

  if (availability === 'disabled') {
    return <PreRegistrationUnavailable audience={audience} />;
  }

  if (availability === 'checking') {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-background px-4 py-12"
        role="status"
        aria-live="polite"
        data-pre-registration-availability="checking"
      >
        <p className="text-sm font-medium text-muted-foreground">
          Verificando disponibilidade da pré-matrícula...
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
