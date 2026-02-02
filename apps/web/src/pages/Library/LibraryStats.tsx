import { useMemo } from 'react';
import { BookOpen, Video, TrendingUp, Target } from 'lucide-react';
import { Exercise } from '../../services/library.service';

interface LibraryStatsProps {
  exercises: Exercise[];
}

export default function LibraryStats({ exercises }: LibraryStatsProps) {
  const stats = useMemo(() => {
    const total = exercises.length;
    const withVideo = exercises.filter((ex) => ex.videoUrl).length;
    const withoutVideo = total - withVideo;

    // Exercícios por categoria
    const byCategory = exercises.reduce((acc, ex) => {
      const cat = ex.category || 'Sem Categoria';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Exercícios por grupo muscular
    const byMuscleGroup = exercises.reduce((acc, ex) => {
      const group = ex.muscleGroup || 'Sem Grupo';
      acc[group] = (acc[group] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Top 5 grupos musculares
    const topMuscleGroups = Object.entries(byMuscleGroup)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return {
      total,
      withVideo,
      withoutVideo,
      videoPercentage: total > 0 ? Math.round((withVideo / total) * 100) : 0,
      byCategory,
      byMuscleGroup,
      topMuscleGroups,
    };
  }, [exercises]);

  return (
    <div className="space-y-6">
      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total de Exercícios */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total de Exercícios</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <BookOpen className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Com Vídeo */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Com Vídeo</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.withVideo}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.videoPercentage}% do total</p>
            </div>
            <div className="bg-green-100 rounded-full p-3">
              <Video className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Sem Vídeo */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Sem Vídeo</p>
              <p className="text-3xl font-bold text-orange-600 mt-2">{stats.withoutVideo}</p>
              <p className="text-xs text-gray-500 mt-1">{100 - stats.videoPercentage}% do total</p>
            </div>
            <div className="bg-orange-100 rounded-full p-3">
              <Video className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        {/* Grupos Musculares */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Grupos Musculares</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">
                {Object.keys(stats.byMuscleGroup).length}
              </p>
            </div>
            <div className="bg-purple-100 rounded-full p-3">
              <Target className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Distribuição por Categoria e Top Grupos Musculares */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribuição por Categoria */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Distribuição por Categoria
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.byCategory).map(([category, count]) => {
              const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              const colors: Record<string, string> = {
                MOBILIDADE: 'bg-blue-500',
                RESISTIDO: 'bg-green-500',
                CICLICO: 'bg-purple-500',
              };
              const color = colors[category] || 'bg-gray-500';

              return (
                <div key={category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{category}</span>
                    <span className="text-sm text-gray-600">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`${color} h-2 rounded-full transition-all duration-300`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 5 Grupos Musculares */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5" />
            Top 5 Grupos Musculares
          </h3>
          <div className="space-y-3">
            {stats.topMuscleGroups.map(([group, count], index) => {
              const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              const colors = [
                'bg-indigo-500',
                'bg-blue-500',
                'bg-cyan-500',
                'bg-teal-500',
                'bg-emerald-500',
              ];
              const color = colors[index] || 'bg-gray-500';

              return (
                <div key={group}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{group}</span>
                    <span className="text-sm text-gray-600">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`${color} h-2 rounded-full transition-all duration-300`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
