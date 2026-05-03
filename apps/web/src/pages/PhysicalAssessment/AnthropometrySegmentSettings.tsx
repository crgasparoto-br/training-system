import { useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/Accordion';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { anthropometryService } from '../../services/anthropometry.service';
import type { AnthropometrySegment } from '../../types/anthropometry';

interface Props {
  segments: AnthropometrySegment[];
  onChanged: () => Promise<void> | void;
}

export function AnthropometrySegmentSettings({ segments, onChanged }: Props) {
  const [customName, setCustomName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const updateFlag = async (segment: AnthropometrySegment, field: 'active' | 'importByDefault' | 'importObservationByDefault', value: boolean) => {
    setSavingId(segment.id);
    await anthropometryService.updateSegment(segment.id, { [field]: value });
    await onChanged();
    setSavingId(null);
  };

  const createCustom = async () => {
    if (!customName.trim()) return;
    setCreating(true);
    await anthropometryService.createSegment({
      name: customName.trim(),
      type: 'personalizado',
      active: true,
      importByDefault: true,
      sexApplicability: 'ambos',
      order: 900 + segments.filter((item) => item.type === 'personalizado').length,
    });
    setCustomName('');
    await onChanged();
    setCreating(false);
  };

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="settings">
        <AccordionTrigger className="text-base font-semibold">Configurações de segmentos</AccordionTrigger>
        <AccordionContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              label="Personalizar"
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="Nome/descrição do segmento"
            />
            <div className="flex items-end">
              <Button type="button" onClick={createCustom} isLoading={creating}>
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-[820px] w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-left">Segmento</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-center">Ativo</th>
                  <th className="px-3 py-2 text-center">Importar medida</th>
                  <th className="px-3 py-2 text-center">Importar observação</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((segment) => (
                  <tr key={segment.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{segment.name}</td>
                    <td className="px-3 py-2">{segment.type}</td>
                    {(['active', 'importByDefault', 'importObservationByDefault'] as const).map((field) => (
                      <td key={field} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(segment[field])}
                          disabled={savingId === segment.id}
                          onChange={(event) => void updateFlag(segment, field, event.target.checked)}
                          className="h-4 w-4 rounded border-border"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {savingId ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Save className="h-3 w-3" />
              Salvando configuração...
            </p>
          ) : null}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
