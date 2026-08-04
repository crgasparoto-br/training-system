import type {
  AdipometryAssessmentDetail,
  AdipometryCalculationPreview,
  AdipometryCorrectionCategory,
  AdipometryProtocolSummary,
} from '@corrida/types';
import { Button } from '../../components/ui/Button';
import type { Aluno } from '../../services/aluno.service';
import { AccessibleDialog, CorrectionDialog, FinalizeDialog, SkinfoldHelpDialog } from './AdipometryDialogs';
import type { AdipometrySkinfoldHelp } from './adipometry-ui';

export function AdipometryScreenOverlays({
  help, showFinalize, current, preview, selectedAluno, responsibleName, selectedProtocol, busy,
  showCorrection, correctionCategory, correctionReason, showCancelCorrection, cancelReason,
  onHelpClose, onFinalizeClose, onFinalizeConfirm, onCorrectionCategory, onCorrectionReason,
  onCorrectionClose, onCorrectionConfirm, onCancelClose, onCancelReason, onCancelConfirm,
}: {
  help: AdipometrySkinfoldHelp | null;
  showFinalize: boolean;
  current: AdipometryAssessmentDetail | null;
  preview: AdipometryCalculationPreview | null;
  selectedAluno?: Aluno;
  responsibleName: string;
  selectedProtocol?: AdipometryProtocolSummary;
  busy: boolean;
  showCorrection: boolean;
  correctionCategory: AdipometryCorrectionCategory;
  correctionReason: string;
  showCancelCorrection: boolean;
  cancelReason: string;
  onHelpClose: () => void;
  onFinalizeClose: () => void;
  onFinalizeConfirm: () => void;
  onCorrectionCategory: (value: AdipometryCorrectionCategory) => void;
  onCorrectionReason: (value: string) => void;
  onCorrectionClose: () => void;
  onCorrectionConfirm: () => void;
  onCancelClose: () => void;
  onCancelReason: (value: string) => void;
  onCancelConfirm: () => void;
}) {
  return (
    <>
      {help ? <SkinfoldHelpDialog item={help} onClose={onHelpClose} /> : null}
      {showFinalize && current && preview?.results ? (
        <FinalizeDialog
          studentName={selectedAluno?.user.profile.name ?? 'Aluno não disponível'}
          date={current.assessmentDate}
          responsible={responsibleName}
          protocol={selectedProtocol ? `${selectedProtocol.name} · ${selectedProtocol.code} v${selectedProtocol.version}` : `${current.protocolCode ?? 'Protocolo'} v${current.protocolVersion ?? '—'}`}
          results={preview.results}
          busy={busy}
          onClose={onFinalizeClose}
          onConfirm={onFinalizeConfirm}
        />
      ) : null}
      {showCorrection ? (
        <CorrectionDialog
          category={correctionCategory}
          reason={correctionReason}
          busy={busy}
          onCategory={onCorrectionCategory}
          onReason={onCorrectionReason}
          onClose={onCorrectionClose}
          onConfirm={onCorrectionConfirm}
        />
      ) : null}
      {showCancelCorrection ? (
        <AccessibleDialog
          title="Cancelar correção"
          description="O rascunho será marcado como cancelado e continuará disponível no histórico de auditoria."
          onClose={onCancelClose}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="adpt-cancel-reason" className="mb-2 block text-sm font-medium">Motivo</label>
              <textarea id="adpt-cancel-reason" rows={4} value={cancelReason} onChange={(event) => onCancelReason(event.target.value)} className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm" placeholder="Explique por que a correção será cancelada." />
              <p className="mt-1 text-xs text-muted-foreground">Mínimo de 10 caracteres.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancelClose}>Voltar</Button>
              <Button type="button" onClick={onCancelConfirm} disabled={busy || cancelReason.trim().length < 10} isLoading={busy}>Confirmar cancelamento</Button>
            </div>
          </div>
        </AccessibleDialog>
      ) : null}
    </>
  );
}
