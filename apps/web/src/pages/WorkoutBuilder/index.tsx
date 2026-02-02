import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { ArrowLeft, Save, Copy, Calendar, Clock, Activity } from 'lucide-react';

interface WorkoutTemplate {
  id: string;
  planId: string;
  mesocycleNumber: number;
  weekNumber: number;
  weekStartDate: string;
  cyclicFrequency?: number;
  resistanceFrequency?: number;
}

interface WorkoutDay {
  id: string;
  templateId: string;
  dayOfWeek: number; // 1=Segunda, 7=Domingo
  workoutDate: string;
  sessionDurationMin?: number;
  location?: string;
  method?: string;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Segunda', short: 'Seg' },
  { value: 2, label: 'Terça', short: 'Ter' },
  { value: 3, label: 'Quarta', short: 'Qua' },
  { value: 4, label: 'Quinta', short: 'Qui' },
  { value: 5, label: 'Sexta', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
  { value: 7, label: 'Domingo', short: 'Dom' },
];

export function WorkoutBuilder() {
  const navigate = useNavigate();
  const { planId, mesocycleNumber, weekNumber } = useParams<{
    planId: string;
    mesocycleNumber: string;
    weekNumber: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [workoutDays, setWorkoutDays] = useState<WorkoutDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(1); // Segunda-feira por padrão
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (planId && mesocycleNumber && weekNumber) {
      loadWorkoutData();
    }
  }, [planId, mesocycleNumber, weekNumber]);

  const loadWorkoutData = async () => {
    setLoading(true);
    try {
      // TODO: Implementar chamada à API
      console.log('Loading workout data...', { planId, mesocycleNumber, weekNumber });
      
      // Mock data temporário
      const mockTemplate: WorkoutTemplate = {
        id: 'temp-id',
        planId: planId!,
        mesocycleNumber: parseInt(mesocycleNumber!),
        weekNumber: parseInt(weekNumber!),
        weekStartDate: new Date().toISOString(),
        cyclicFrequency: 3,
        resistanceFrequency: 2,
      };
      
      setTemplate(mockTemplate);
      
      // Mock workout days
      const mockDays: WorkoutDay[] = DAYS_OF_WEEK.map(day => ({
        id: `day-${day.value}`,
        templateId: mockTemplate.id,
        dayOfWeek: day.value,
        workoutDate: new Date().toISOString(),
        sessionDurationMin: 60,
        location: 'Esteira',
        method: 'IEXT',
      }));
      
      setWorkoutDays(mockDays);
    } catch (error) {
      console.error('Erro ao carregar dados do treino:', error);
      alert('Erro ao carregar dados do treino');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // TODO: Implementar salvamento
      console.log('Saving workout...', { template, workoutDays });
      alert('Treinos salvos com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar treinos:', error);
      alert('Erro ao salvar treinos');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyWeek = async () => {
    if (!confirm('Deseja copiar esta semana inteira?')) {
      return;
    }
    
    try {
      // TODO: Implementar cópia de semana
      console.log('Copying week...');
      alert('Funcionalidade de copiar semana será implementada em breve');
    } catch (error) {
      console.error('Erro ao copiar semana:', error);
      alert('Erro ao copiar semana');
    }
  };

  const getCurrentDay = () => {
    return workoutDays.find(day => day.dayOfWeek === selectedDay);
  };

  const getWeekSummary = () => {
    const totalDuration = workoutDays.reduce(
      (sum, day) => sum + (day.sessionDurationMin || 0),
      0
    );
    
    return {
      totalDuration,
      totalWorkouts: workoutDays.filter(day => day.sessionDurationMin && day.sessionDurationMin > 0).length,
      totalExercises: 0, // TODO: Calcular quando exercícios forem implementados
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando treinos...</p>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Erro ao carregar template</p>
          <Button onClick={() => navigate(`/plans/${planId}`)} className="mt-4">
            Voltar ao Plano
          </Button>
        </div>
      </div>
    );
  }

  const summary = getWeekSummary();
  const currentDay = getCurrentDay();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/plans/${planId}`)}
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Montagem de Treinos</h1>
            <p className="text-muted-foreground mt-1">
              Mesociclo {template.mesocycleNumber} - Semana {template.weekNumber}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopyWeek}>
            <Copy size={16} className="mr-2" />
            Copiar Semana
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} className="mr-2" />
            {saving ? 'Salvando...' : 'Salvar Treinos'}
          </Button>
        </div>
      </div>

      {/* Resumo da Semana */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📊 Resumo da Semana</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="flex items-center gap-3">
              <Clock className="text-primary" size={20} />
              <div>
                <p className="text-sm text-muted-foreground">Volume Total</p>
                <p className="text-lg font-semibold">{summary.totalDuration} min</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Calendar className="text-primary" size={20} />
              <div>
                <p className="text-sm text-muted-foreground">Treinos</p>
                <p className="text-lg font-semibold">{summary.totalWorkouts}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Activity className="text-primary" size={20} />
              <div>
                <p className="text-sm text-muted-foreground">Exercícios</p>
                <p className="text-lg font-semibold">{summary.totalExercises}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Activity className="text-blue-600" size={20} />
              <div>
                <p className="text-sm text-muted-foreground">Freq. Cíclico</p>
                <p className="text-lg font-semibold">{template.cyclicFrequency || 0}x</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Activity className="text-green-600" size={20} />
              <div>
                <p className="text-sm text-muted-foreground">Freq. Resistido</p>
                <p className="text-lg font-semibold">{template.resistanceFrequency || 0}x</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs dos Dias da Semana */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📅 Dias da Semana</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {DAYS_OF_WEEK.map(day => (
              <button
                key={day.value}
                onClick={() => setSelectedDay(day.value)}
                className={`
                  flex-shrink-0 px-4 py-2 rounded-lg font-medium transition-colors
                  ${selectedDay === day.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80'
                  }
                `}
              >
                <span className="hidden md:inline">{day.label}</span>
                <span className="md:hidden">{day.short}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Conteúdo do Dia Selecionado */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {DAYS_OF_WEEK.find(d => d.value === selectedDay)?.label}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {currentDay?.workoutDate ? new Date(currentDay.workoutDate).toLocaleDateString('pt-BR') : ''}
              </p>
            </div>
            
            {currentDay && (
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Duração: </span>
                  <span className="font-medium">{currentDay.sessionDurationMin || 0} min</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Local: </span>
                  <span className="font-medium">{currentDay.location || 'Não definido'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Método: </span>
                  <span className="font-medium">{currentDay.method || 'Não definido'}</span>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {currentDay ? (
            <div className="space-y-6">
              {/* Configurações do Dia */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-secondary/50 rounded-lg">
                <div>
                  <label className="text-sm font-medium">Duração (min)</label>
                  <input
                    type="number"
                    value={currentDay.sessionDurationMin || ''}
                    onChange={(e) => {
                      // TODO: Atualizar estado
                      console.log('Update duration:', e.target.value);
                    }}
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                    placeholder="60"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Local</label>
                  <select
                    value={currentDay.location || ''}
                    onChange={(e) => {
                      // TODO: Atualizar estado
                      console.log('Update location:', e.target.value);
                    }}
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                  >
                    <option value="">Selecione...</option>
                    <option value="Esteira">Esteira</option>
                    <option value="Pista">Pista</option>
                    <option value="Rua">Rua</option>
                    <option value="Bicicleta">Bicicleta</option>
                    <option value="Academia">Academia</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Método</label>
                  <select
                    value={currentDay.method || ''}
                    onChange={(e) => {
                      // TODO: Atualizar estado
                      console.log('Update method:', e.target.value);
                    }}
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                  >
                    <option value="">Selecione...</option>
                    <option value="IEXT">IEXT</option>
                    <option value="IINT">IINT</option>
                    <option value="Contínuo">Contínuo</option>
                    <option value="Intervalado">Intervalado</option>
                  </select>
                </div>
              </div>

              {/* Seções de Exercícios */}
              <div className="space-y-4">
                <div className="border-l-4 border-purple-500 pl-4">
                  <h3 className="font-semibold text-lg mb-2">MOBILIDADE</h3>
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Nenhum exercício adicionado</p>
                    <Button className="mt-4" size="sm">
                      + Adicionar Exercício
                    </Button>
                  </div>
                </div>

                <div className="border-l-4 border-orange-500 pl-4">
                  <h3 className="font-semibold text-lg mb-2">AQUECIMENTO</h3>
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Nenhum exercício adicionado</p>
                    <Button className="mt-4" size="sm">
                      + Adicionar Exercício
                    </Button>
                  </div>
                </div>

                <div className="border-l-4 border-yellow-500 pl-4">
                  <h3 className="font-semibold text-lg mb-2">ATIVAÇÃO</h3>
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Nenhum exercício adicionado</p>
                    <Button className="mt-4" size="sm">
                      + Adicionar Exercício
                    </Button>
                  </div>
                </div>

                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold text-lg mb-2">TÉCNICO</h3>
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Nenhum exercício adicionado</p>
                    <Button className="mt-4" size="sm">
                      + Adicionar Exercício
                    </Button>
                  </div>
                </div>

                <div className="border-l-4 border-green-500 pl-4">
                  <h3 className="font-semibold text-lg mb-2">SESSÃO PRINCIPAL</h3>
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Nenhum exercício adicionado</p>
                    <Button className="mt-4" size="sm">
                      + Adicionar Exercício
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Selecione um dia da semana para começar</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
