import { ProntuarioScreen } from './ProntuarioScreen';
import './prontuario-screen.css';

/**
 * Mantém o ponto de entrada histórico da rota sem duplicar o editor de dores.
 * O ProntuarioScreen já concentra casos de dor, snapshots corporais e histórico.
 */
export function ProntuarioScreenWithDiscomfortFollowUps() {
  return (
    <section
      className="prontuario-workspace"
      aria-label="Prontuário de entrevista e acompanhamento"
    >
      <ProntuarioScreen />
    </section>
  );
}
