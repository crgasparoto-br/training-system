import { ExternalLink, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { AnthropometrySegment } from '../../types/anthropometry';

interface Props {
  segment: AnthropometrySegment | null;
  alunoSex?: 'male' | 'female' | 'other';
  onClose: () => void;
}

export function AnthropometryHelpDialog({ segment, alunoSex, onClose }: Props) {
  if (!segment) return null;

  const imageUrl = alunoSex === 'female' ? segment.femaleImageUrl : alunoSex === 'male' ? segment.maleImageUrl : segment.maleImageUrl || segment.femaleImageUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{segment.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ajuda técnica da medida antropométrica</p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Fechar ajuda">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {segment.technicalDescription ? (
            <p className="text-sm leading-6 text-foreground">{segment.technicalDescription}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Descrição técnica ainda não cadastrada.</p>
          )}

          {segment.formulaHint ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
              {segment.formulaHint}
            </div>
          ) : null}

          {imageUrl ? (
            <img src={imageUrl} alt={`Referência visual para ${segment.name}`} className="max-h-[360px] w-full rounded-lg object-contain" />
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
              Imagem específica para o sexo do aluno ainda não cadastrada.
            </div>
          )}

          {segment.tutorialVideoUrl ? (
            <a href={segment.tutorialVideoUrl} target="_blank" rel="noreferrer">
              <Button type="button" variant="outline">
                <ExternalLink className="h-4 w-4" />
                Abrir vídeo tutorial
              </Button>
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
