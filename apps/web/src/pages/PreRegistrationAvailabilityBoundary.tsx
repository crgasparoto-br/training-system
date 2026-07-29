import { useEffect, useState, type ReactNode } from 'react';
import {
  PRE_REGISTRATION_DISABLED_EVENT,
  isPreRegistrationDisabledError,
  isPreRegistrationDisabledResponse,
} from '../config/pre-registration-availability';
import api from '../services/api';
import { PreRegistrationUnavailable } from './PreRegistrationUnavailable';

type Availability = 'checking' | 'enabled' | 'disabled';

interface PreRegistrationAvailabilityBoundaryProps {
  audience: 'public' | 'administrative';
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

    api
      .get('/pre-registration/availability', { validateStatus: () => true })
      .then((response) => {
        if (!active) return;
        setAvailability(
          isPreRegistrationDisabledResponse(response.status, response.data)
            ? 'disabled'
            : 'enabled'
        );
      })
      .catch((error) => {
        if (!active) return;
        setAvailability(isPreRegistrationDisabledError(error) ? 'disabled' : 'enabled');
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
      >
        <p className="text-sm font-medium text-muted-foreground">
          Verificando disponibilidade da pré-matrícula...
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
