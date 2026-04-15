import { useEffect, useMemo, useState } from 'react';
import {
  subjectiveScaleService,
  type SubjectiveScaleItem,
  type SubjectiveScaleType,
} from '../../services/subjective-scale.service';

const scaleMeta: Record<SubjectiveScaleType, { title: string; description: string }> = {
  PSE: {
    title: 'PSE - Percepção Subjetiva de Esforço',
    description:
      'Escala usada para o aluno informar o quanto o esforco foi percebido na sessao.',
  },
  PSR: {
    title: 'PSR - Percepção Subjetiva de Recuperação',
    description:
      'Escala usada para o aluno informar o nivel de recuperacao antes da sessao.',
  },
};

const scaleColors: Record<SubjectiveScaleType, Record<number, string>> = {
  PSE: {
    0: '#D9EAD3',
    1: '#B6D7A8',
    2: '#93C47D',
    3: '#6AA84F',
    4: '#FFFF00',
    5: '#FF9900',
    6: '#E69138',
    7: '#EA9999',
    8: '#CC0000',
    9: '#990000',
    10: '#000000',
  },
  PSR: {
    0: '#000000',
    1: '#990000',
    2: '#CC0000',
    3: '#EA9999',
    4: '#E69138',
    5: '#FF9900',
    6: '#FFFF00',
    7: '#6AA84F',
    8: '#93C47D',
    9: '#B6D7A8',
    10: '#D9EAD3',
  },
};

const isDarkColor = (hex: string) => {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 120;
};

export default function SettingsSubjectiveScales() {
  const [items, setItems] = useState<SubjectiveScaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await subjectiveScaleService.list();
      setItems(data);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar escalas subjetivas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const grouped = useMemo(() => {
    const byType: Record<SubjectiveScaleType, SubjectiveScaleItem[]> = {
      PSE: [],
      PSR: [],
    };

    items
      .filter((item) => item.isActive)
      .forEach((item) => {
        byType[item.type].push(item);
      });

    (Object.keys(byType) as SubjectiveScaleType[]).forEach((type) => {
      byType[type].sort((a, b) => a.order - b.order || a.value - b.value);
    });

    return byType;
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PSR e PSE</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro base das escalas subjetivas utilizadas pelos alunos.
          </p>
        </div>
        <button
          type="button"
          onClick={loadItems}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Atualizar lista
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {(Object.keys(scaleMeta) as SubjectiveScaleType[]).map((type) => (
          <div key={type} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{scaleMeta[type].title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{scaleMeta[type].description}</p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-6 text-center text-gray-400">
                        Carregando...
                      </td>
                    </tr>
                  ) : grouped[type].length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-6 text-center text-gray-400">
                        Nenhuma escala cadastrada
                      </td>
                    </tr>
                  ) : (
                    grouped[type].map((item) => {
                      const bgColor = scaleColors[type][item.value];
                      const textColor = bgColor && isDarkColor(bgColor) ? '#FFFFFF' : '#1F2937';
                      return (
                        <tr key={item.id} className="border-b">
                          <td
                            className="px-3 py-2"
                            style={{ backgroundColor: bgColor, color: textColor }}
                          >
                            {item.value}
                          </td>
                          <td
                            className="px-3 py-2"
                            style={{ backgroundColor: bgColor, color: textColor }}
                          >
                            {item.label?.trim() ? item.label.trim() : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
