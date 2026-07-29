import { useEffect, useState, type ReactNode } from 'react';
import {
  PRE_REGISTRATION_DISABLED_EVENT,
  isPreRegistrationDisabledError,
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

    // With an explicit API origin, probe before exposing the route. Same-origin
    // deployments rely on the first real pre-registration request and the Axios
    // interceptor below, avoiding a synthetic 404 in static preview harnesses.
    if (!import.meta.env.VITE_API_URL?.trim()) {
      setAvailability('enabled');
      return () => {
        active = false;
        window.removeEventListener(PRE_REGISTRATION_DISABLED_EVENT, markDisabled);
      };
    }

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
