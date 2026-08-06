import { ProntuarioScreen } from './ProntuarioScreen';
import './prontuario-screen.css';

/**
 * Mantem o ponto de entrada historico da rota sem duplicar o editor de dores.
 * O ProntuarioScreen ja concentra casos de dor, snapshots corporais e historico.
 */
export function ProntuarioScreenWithDiscomfortFollowUps() {
  return (
    <section
      className="prontuario-workspace"
      aria-label="Prontuario de entrevista e acompanhamento"
    >
      <ProntuarioScreen />
    </section>
  );
}
