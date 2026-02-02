interface CyclicDayColumnProps {
  dayOfWeek: number;
  label: string;
  date: string;
  data: any;
  onChange: (data: any) => void;
}

export default function CyclicDayColumn({ dayOfWeek, label, date, data, onChange }: CyclicDayColumnProps) {
  const handleChange = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="flex-shrink-0 w-64 border border-gray-200 rounded-lg p-4 bg-gray-50">
      {/* Header */}
      <div className="mb-4 pb-3 border-b border-gray-200">
        <div className="text-xs text-gray-500">{date}</div>
        <div className="text-sm font-semibold text-gray-900">{label}</div>
      </div>

      {/* Campos */}
      <div className="space-y-3">
        {/* Tempo da sessão */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Sessão (min)
          </label>
          <input
            type="number"
            value={data.sessionDurationMin || ''}
            onChange={(e) => handleChange('sessionDurationMin', parseInt(e.target.value) || 0)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Tempo do estímulo */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Estímulo (min)
          </label>
          <input
            type="number"
            value={data.stimulusDurationMin || ''}
            onChange={(e) => handleChange('stimulusDurationMin', parseInt(e.target.value) || null)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Local */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Local
          </label>
          <select
            value={data.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Selecione...</option>
            <option value="Esteira">Esteira</option>
            <option value="Bicicleta">Bicicleta</option>
            <option value="Pista">Pista</option>
            <option value="Corda">Corda</option>
            <option value="Rua">Rua</option>
          </select>
        </div>

        {/* Método */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Método
          </label>
          <select
            value={data.method || ''}
            onChange={(e) => handleChange('method', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Selecione...</option>
            <option value="CEXT">CEXT</option>
            <option value="CINT">CINT</option>
            <option value="IEXT">IEXT</option>
            <option value="IINT">IINT</option>
          </select>
        </div>

        {/* Intensidade 1 */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Intensidade 1 (%)
          </label>
          <input
            type="number"
            step="0.1"
            value={data.intensity1 || ''}
            onChange={(e) => handleChange('intensity1', parseFloat(e.target.value) || null)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Intensidade 2 */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Intensidade 2 (%)
          </label>
          <input
            type="number"
            step="0.1"
            value={data.intensity2 || ''}
            onChange={(e) => handleChange('intensity2', parseFloat(e.target.value) || null)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Nº sessões */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Nº sessões
          </label>
          <input
            type="number"
            value={data.numSessions || ''}
            onChange={(e) => handleChange('numSessions', parseInt(e.target.value) || null)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Nº séries */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Nº séries
          </label>
          <input
            type="number"
            value={data.numSets || ''}
            onChange={(e) => handleChange('numSets', parseInt(e.target.value) || null)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Tempo intenso */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Tempo intenso (s)
          </label>
          <input
            type="number"
            value={data.sessionTime || ''}
            onChange={(e) => handleChange('sessionTime', parseInt(e.target.value) || null)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Tempo repouso */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Tempo repouso (s)
          </label>
          <input
            type="number"
            value={data.restTime || ''}
            onChange={(e) => handleChange('restTime', parseInt(e.target.value) || null)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* FC alvo */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            FC alvo (bpm)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder="Min"
              value={data.targetHrMin || ''}
              onChange={(e) => handleChange('targetHrMin', parseFloat(e.target.value) || null)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="number"
              placeholder="Max"
              value={data.targetHrMax || ''}
              onChange={(e) => handleChange('targetHrMax', parseFloat(e.target.value) || null)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Velocidade */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Velocidade (km/h)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.1"
              placeholder="Min"
              value={data.targetSpeedMin || ''}
              onChange={(e) => handleChange('targetSpeedMin', parseFloat(e.target.value) || null)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="number"
              step="0.1"
              placeholder="Max"
              value={data.targetSpeedMax || ''}
              onChange={(e) => handleChange('targetSpeedMax', parseFloat(e.target.value) || null)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Detalhamento */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Detalhamento
          </label>
          <textarea
            rows={3}
            value={data.detailNotes || ''}
            onChange={(e) => handleChange('detailNotes', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Descreva os detalhes do treino..."
          />
        </div>

        {/* Complemento */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Complemento
          </label>
          <textarea
            rows={2}
            value={data.complementNotes || ''}
            onChange={(e) => handleChange('complementNotes', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Informações complementares..."
          />
        </div>
      </div>
    </div>
  );
}
