import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { commonCopy, referenceTableCopy } from '../../i18n/ptBR';
import structured from '../../data/referenceTableStructured.json';
import rawSeed from '../../data/referenceTableSeed.json';

type StructuredRecord = {
  capacidadesFisicas: string;
  testesFisicos: string;
  sexo: 'Masculino' | 'Feminino' | string;
  idadeMin: number | null;
  idadeMax: number | null;
  indiceMin: string | null;
  indiceMax: string | null;
  status: string;
  fonte?: string;
  rawIndice?: string;
};

type ReferenceImage = {
  row: number;
  col: number;
  file: string;
  src: string;
};

type StructuredSeed = {
  records: StructuredRecord[];
  totalRecords: number;
};

const STORAGE_KEY = 'training_system:reference_table_structured:v1';

const CAPACIDADE_LABEL_MAP: Record<string, string> = {
  'Relação Cintura Quadril': 'Relação Cintura Quadril',
  'RML ABDOMINAL': 'RML Abdominal',
  'RML M.SUPERIORES': 'RML Membros Superiores',
  'Força Muscular Supino - 1 RM': 'Força Muscular Supino - 1 RM',
  'Força Muscular Leg Press - 1 RM': 'Força Muscular Leg Press - 1 RM',
  FLEXIBILIDADE: 'Flexibilidade',
  'CONSUMO MÁXIMO DE OXIGÊNIO': 'Consumo Máximo de Oxigênio',
  'COMPOSIÇÃO CORPORAL': 'Composição Corporal',
};

const CAPACIDADE_FONTE_MAP: Record<string, string> = {
  'Relação Cintura Quadril': 'Applied Body Composition Assessment, 1996.',
  'RML Abdominal': 'Pollock, M. L. & Wilmore, J. H., 1993',
  'RML Membros Superiores': 'Pollock, M. L. & Wilmore, J. H., 1993',
  'Força Muscular Supino - 1 RM': 'Adaptado de Heyward, 1991',
  'Força Muscular Leg Press - 1 RM': 'Adaptado de Heyward, 1991',
  Flexibilidade: 'Canadian Standardized Teste of Fitness (CSTF)',
  'Consumo Máximo de Oxigênio': 'Herdy, A. H. & Caixeta, A., 2016',
  'Composição Corporal': 'Cooper Institute, 2009',
};

function toDisplay(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).replace('.', ',');
}

function toEditableNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function defaultRecord(): StructuredRecord {
  return {
    capacidadesFisicas: '',
    testesFisicos: '',
    sexo: 'Masculino',
    idadeMin: null,
    idadeMax: null,
    indiceMin: null,
    indiceMax: null,
    status: 'Baixo',
    fonte: '',
  };
}

function normalizeRecord(record: StructuredRecord): StructuredRecord {
  const capacidade = record.capacidadesFisicas?.trim() || '';
  const capacidadeNormalizada = CAPACIDADE_LABEL_MAP[capacidade] || capacidade;
  const fontePadrao = CAPACIDADE_FONTE_MAP[capacidadeNormalizada] || '';
  return {
    ...record,
    capacidadesFisicas: capacidadeNormalizada,
    testesFisicos: record.testesFisicos?.trim() || '',
    sexo: record.sexo === 'Feminino' ? 'Feminino' : 'Masculino',
    status: record.status?.trim() || '',
    fonte: record.fonte?.trim() || fontePadrao,
    indiceMin: record.indiceMin?.trim() || null,
    indiceMax: record.indiceMax?.trim() || null,
  };
}

export default function SettingsReferenceTable() {
  const seed = structured as StructuredSeed;

  const [records, setRecords] = useState<StructuredRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return (JSON.parse(saved) as StructuredRecord[]).map(normalizeRecord);
      } catch {
        return seed.records.map(normalizeRecord);
      }
    }
    return seed.records.map(normalizeRecord);
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [capacidadeFilter, setCapacidadeFilter] = useState('Todos');
  const [testeFilter, setTesteFilter] = useState('Todos');
  const [sexoFilter, setSexoFilter] = useState<'Todos' | 'Masculino' | 'Feminino'>('Todos');
  const [idadeFrom, setIdadeFrom] = useState('');
  const [idadeTo, setIdadeTo] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const capacidadeOptions = useMemo(
    () => ['Todos', ...Array.from(new Set(records.map((r) => r.capacidadesFisicas))).sort()],
    [records]
  );
  const testeOptions = useMemo(
    () => ['Todos', ...Array.from(new Set(records.map((r) => r.testesFisicos))).sort()],
    [records]
  );

  const filteredIndexes = useMemo(() => {
    const term = search.toLowerCase().trim();
    const indexes: number[] = [];

    records.forEach((record, index) => {
      if (capacidadeFilter !== 'Todos' && record.capacidadesFisicas !== capacidadeFilter) return;
      if (testeFilter !== 'Todos' && record.testesFisicos !== testeFilter) return;
      if (sexoFilter !== 'Todos' && record.sexo !== sexoFilter) return;
      if (idadeFrom) {
        const min = Number(idadeFrom);
        if (Number.isFinite(min) && record.idadeMax !== null && record.idadeMax < min) return;
      }
      if (idadeTo) {
        const max = Number(idadeTo);
        if (Number.isFinite(max) && record.idadeMin !== null && record.idadeMin > max) return;
      }

      if (term) {
        const haystack = [
          record.capacidadesFisicas,
          record.testesFisicos,
          record.sexo,
          record.status,
          record.fonte ?? '',
          String(record.idadeMin ?? ''),
          String(record.idadeMax ?? ''),
          String(record.indiceMin ?? ''),
          String(record.indiceMax ?? ''),
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(term)) return;
      }

      indexes.push(index);
    });

    return indexes;
  }, [records, search, capacidadeFilter, testeFilter, sexoFilter, idadeFrom, idadeTo]);

  const selectedRecord = records[selectedIndex] ?? null;

  const updateRecord = (index: number, patch: Partial<StructuredRecord>) => {
    setRecords((prev) => prev.map((item, i) => (i === index ? normalizeRecord({ ...item, ...patch }) : item)));
  };

  const addRecord = () => {
    setRecords((prev) => [...prev, defaultRecord()]);
    setSelectedIndex(records.length);
    setStatusMessage(referenceTableCopy.rowAdded);
  };

  const removeRecord = () => {
    if (!selectedRecord) return;
    setRecords((prev) => prev.filter((_, index) => index !== selectedIndex));
    setSelectedIndex((prev) => Math.max(0, prev - 1));
    setStatusMessage(referenceTableCopy.rowRemoved);
  };

  const saveChanges = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    setStatusMessage(referenceTableCopy.changesSaved);
  };

  const resetChanges = () => {
    setRecords(seed.records.map(normalizeRecord));
    setSelectedIndex(0);
    localStorage.removeItem(STORAGE_KEY);
    setStatusMessage(referenceTableCopy.changesReset);
  };

  const images = ((rawSeed as any).images ?? []) as ReferenceImage[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ts-h3">{referenceTableCopy.title}</h1>
          <p className="ts-body text-muted-foreground">
            {referenceTableCopy.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={addRecord}>{referenceTableCopy.addRow}</Button>
          <Button variant="destructive" onClick={removeRecord} disabled={!selectedRecord}>{referenceTableCopy.removeRow}</Button>
          <Button onClick={saveChanges}>{commonCopy.save}</Button>
          <Button variant="outline" onClick={resetChanges}>{referenceTableCopy.restore}</Button>
        </div>
      </div>

      {statusMessage ? (
        <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">{statusMessage}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={referenceTableCopy.searchPlaceholder}
              className="h-10 min-w-[260px] flex-1 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
            />
            <select
              value={capacidadeFilter}
              onChange={(e) => setCapacidadeFilter(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              {capacidadeOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <select
              value={testeFilter}
              onChange={(e) => setTesteFilter(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              {testeOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <select
              value={sexoFilter}
              onChange={(e) => setSexoFilter(e.target.value as any)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option>Todos</option>
              <option>Masculino</option>
              <option>Feminino</option>
            </select>
            <input
              type="number"
              value={idadeFrom}
              onChange={(e) => setIdadeFrom(e.target.value)}
              className="h-10 w-28 rounded-xl border border-input bg-background px-3 text-sm"
              placeholder={referenceTableCopy.ageFrom}
              min={0}
            />
            <input
              type="number"
              value={idadeTo}
              onChange={(e) => setIdadeTo(e.target.value)}
              className="h-10 w-28 rounded-xl border border-input bg-background px-3 text-sm"
              placeholder={referenceTableCopy.ageTo}
              min={0}
            />
            <div className="text-xs text-muted-foreground">{filteredIndexes.length} {referenceTableCopy.rowsCount}</div>
          </div>

          <div className="max-h-[68vh] overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#1f2937] text-white">
                  <th className="border border-[#374151] px-3 py-2 text-left">{referenceTableCopy.physicalCapabilities}</th>
                  <th className="border border-[#374151] px-3 py-2 text-left">{referenceTableCopy.physicalTests}</th>
                  <th className="border border-[#374151] px-3 py-2 text-left">{referenceTableCopy.gender}</th>
                  <th className="border border-[#374151] px-3 py-2 text-right">Idade (&gt;=)</th>
                  <th className="border border-[#374151] px-3 py-2 text-right">Idade (&lt;=)</th>
                  <th className="border border-[#374151] px-3 py-2 text-right">{referenceTableCopy.index} (&gt;=)</th>
                  <th className="border border-[#374151] px-3 py-2 text-right">{referenceTableCopy.index} (&lt;=)</th>
                  <th className="border border-[#374151] px-3 py-2 text-left">{referenceTableCopy.status}</th>
                  <th className="border border-[#374151] px-3 py-2 text-left">{referenceTableCopy.source}</th>
                </tr>
              </thead>
              <tbody>
                {filteredIndexes.map((index) => {
                  const row = records[index];
                  const selected = index === selectedIndex;
                  const baseRowColor = row.sexo === 'Masculino' ? 'bg-[#dbeafe]' : 'bg-[#fee2e2]';
                  return (
                    <tr
                      key={`row-${index}`}
                      onClick={() => setSelectedIndex(index)}
                      className={`${baseRowColor} cursor-pointer ${selected ? 'outline outline-2 outline-[#2563eb]' : ''}`}
                    >
                      <td className="border border-[#cbd5e1] px-3 py-2">{row.capacidadesFisicas}</td>
                      <td className="border border-[#cbd5e1] px-3 py-2">{row.testesFisicos}</td>
                      <td className="border border-[#cbd5e1] px-3 py-2">{row.sexo}</td>
                      <td className="border border-[#cbd5e1] px-3 py-2 text-right">{toDisplay(row.idadeMin)}</td>
                      <td className="border border-[#cbd5e1] px-3 py-2 text-right">{toDisplay(row.idadeMax)}</td>
                      <td className="border border-[#cbd5e1] px-3 py-2 text-right">{toDisplay(row.indiceMin)}</td>
                      <td className="border border-[#cbd5e1] px-3 py-2 text-right">{toDisplay(row.indiceMax)}</td>
                      <td className="border border-[#cbd5e1] px-3 py-2">{row.status}</td>
                      <td className="border border-[#cbd5e1] px-3 py-2">{row.fonte || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-4">
          <h2 className="ts-h4">{referenceTableCopy.maintenanceTitle}</h2>
          {!selectedRecord ? (
            <p className="text-sm text-muted-foreground">{referenceTableCopy.selectRowHint}</p>
          ) : (
            <div className="space-y-3">
              <label className="space-y-1 block">
                <span className="ts-label">{referenceTableCopy.physicalCapabilities}</span>
                <input
                  value={selectedRecord.capacidadesFisicas}
                  onChange={(e) => updateRecord(selectedIndex, { capacidadesFisicas: e.target.value })}
                  className="h-10 w-full rounded-xl border border-input px-3 text-sm"
                />
              </label>
              <label className="space-y-1 block">
                <span className="ts-label">{referenceTableCopy.physicalTests}</span>
                <input
                  value={selectedRecord.testesFisicos}
                  onChange={(e) => updateRecord(selectedIndex, { testesFisicos: e.target.value })}
                  className="h-10 w-full rounded-xl border border-input px-3 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="ts-label">{referenceTableCopy.gender}</span>
                  <select
                    value={selectedRecord.sexo}
                    onChange={(e) => updateRecord(selectedIndex, { sexo: e.target.value as 'Masculino' | 'Feminino' })}
                    className="h-10 w-full rounded-xl border border-input px-3 text-sm"
                  >
                    <option>Masculino</option>
                    <option>Feminino</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <label className="space-y-1 block">
                  <span className="ts-label">{referenceTableCopy.status}</span>
                  <input
                    value={selectedRecord.status}
                    onChange={(e) => updateRecord(selectedIndex, { status: e.target.value })}
                    className="h-10 w-full rounded-xl border border-input px-3 text-sm"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="ts-label">{referenceTableCopy.source}</span>
                  <input
                    value={selectedRecord.fonte || ''}
                    onChange={(e) => updateRecord(selectedIndex, { fonte: e.target.value })}
                    className="h-10 w-full rounded-xl border border-input px-3 text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="ts-label">Idade (&gt;=)</span>
                  <input
                    value={toDisplay(selectedRecord.idadeMin)}
                    onChange={(e) => updateRecord(selectedIndex, { idadeMin: toEditableNumber(e.target.value) })}
                    className="h-10 w-full rounded-xl border border-input px-3 text-sm"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="ts-label">Idade (&lt;=)</span>
                  <input
                    value={toDisplay(selectedRecord.idadeMax)}
                    onChange={(e) => updateRecord(selectedIndex, { idadeMax: toEditableNumber(e.target.value) })}
                    className="h-10 w-full rounded-xl border border-input px-3 text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="ts-label">{referenceTableCopy.index} (&gt;=)</span>
                  <input
                    value={toDisplay(selectedRecord.indiceMin)}
                    onChange={(e) => updateRecord(selectedIndex, { indiceMin: e.target.value || null })}
                    className="h-10 w-full rounded-xl border border-input px-3 text-sm"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="ts-label">{referenceTableCopy.index} (&lt;=)</span>
                  <input
                    value={toDisplay(selectedRecord.indiceMax)}
                    onChange={(e) => updateRecord(selectedIndex, { indiceMax: e.target.value || null })}
                    className="h-10 w-full rounded-xl border border-input px-3 text-sm"
                  />
                </label>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="ts-h4 mb-3">{referenceTableCopy.imagesTitle}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {images.map((img) => (
            <figure key={img.file} className="space-y-1 rounded-xl border p-2">
              <img src={img.src} alt={img.file} className="h-28 w-full rounded-lg border object-cover" />
              <figcaption className="text-xs text-muted-foreground">{referenceTableCopy.rowLabel} {img.row} {referenceTableCopy.columnLabel} {img.col}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
