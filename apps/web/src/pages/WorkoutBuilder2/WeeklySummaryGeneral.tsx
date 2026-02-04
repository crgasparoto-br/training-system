interface WeeklySummaryGeneralProps {
  templateData: any;
}

export default function WeeklySummaryGeneral({ templateData }: WeeklySummaryGeneralProps) {
  if (!templateData) return null;

  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  
  // Mock data - será substituído por dados reais
  const cyclicTimes = {
    seg: 50,
    ter: 40,
    qua: 10,
    qui: 35,
    sex: 60,
    sab: 10,
    dom: 0
  };
  const resistanceTimes = {
    seg: 24,
    ter: 12,
    qua: 4,
    qui: 15,
    sex: 24,
    sab: 4,
    dom: 0
  };
  const sessionTimes = {
    seg: 74,
    ter: 52,
    qua: 14,
    qui: 50,
    sex: 84,
    sab: 14,
    dom: 0
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Resumo da Semana
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Frequências */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Frequências</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Frequência Total:</span>
              <span className="text-sm font-medium text-gray-900">
                {(templateData.cyclicFrequency || 0) + (templateData.resistanceFrequency || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Frequência Cíclico:</span>
              <span className="text-sm font-medium text-gray-900">
                {templateData.cyclicFrequency || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Frequência Resistido:</span>
              <span className="text-sm font-medium text-gray-900">
                {templateData.resistanceFrequency || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Volumes */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Volumes</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Volume Total:</span>
              <span className="text-sm font-medium text-gray-900">
                {templateData.totalVolumeMin || 0} min
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Volume Km:</span>
              <span className="text-sm font-medium text-gray-900">
                {templateData.totalVolumeKm || 0} km
              </span>
            </div>
          </div>
        </div>

        {/* Tempo de Sessão por Dia */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Tempo da Sessão</h3>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-xs font-medium text-gray-700 text-left">
                    Treinamentos
                  </th>
                  {days.map((day) => (
                    <th
                      key={day}
                      className="px-2 py-2 text-xs font-medium text-gray-700 text-center"
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-2 py-2 text-xs text-gray-600">Cíclico</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{cyclicTimes.seg}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{cyclicTimes.ter}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{cyclicTimes.qua}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{cyclicTimes.qui}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{cyclicTimes.sex}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{cyclicTimes.sab}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{cyclicTimes.dom}</td>
                </tr>
                <tr>
                  <td className="px-2 py-2 text-xs text-gray-600">Resistido</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{resistanceTimes.seg}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{resistanceTimes.ter}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{resistanceTimes.qua}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{resistanceTimes.qui}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{resistanceTimes.sex}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{resistanceTimes.sab}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{resistanceTimes.dom}</td>
                </tr>
                <tr>
                  <td className="px-2 py-2 text-xs text-gray-600">Tempo da Sessão</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.seg}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.ter}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.qua}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.qui}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.sex}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.sab}</td>
                  <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.dom}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
