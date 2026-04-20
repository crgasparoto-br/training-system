import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { planService, type TrainingPlan, type Microcycle, type CreateSessionDTO } from '../services/plan.service';
import { SessionModal } from '../components/SessionModal';
import { PeriodizationMatrixComponent } from '../components/PeriodizationMatrix';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { planDetailsCopy } from '../i18n/ptBR';
import { formatDateBR } from '../utils/date';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Calendar,
  Activity,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export function PlanDetails() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [selectedMesocycleId, setSelectedMesocycleId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<Microcycle | null>(null);
  const [activeTab, setActiveTab] = useState<'sessions' | 'periodization'>('sessions');

  useEffect(() => {
    if (id) {
      loadPlan(id);
    }
  }, [id]);

  const loadPlan = async (planId: string) => {
    setLoading(true);
    try {
      const data = await planService.getById(planId);
      setPlan(data);
    } catch (error) {
      console.error('Erro ao carregar plano:', error);
      alert(planDetailsCopy.loadError);
      navigate('/plans');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm(planDetailsCopy.deleteConfirm)) {
      return;
    }

    try {
      await planService.delete(id);
      alert(planDetailsCopy.deleteSuccess);
      navigate('/plans');
    } catch (error) {
      console.error('Erro ao deletar plano:', error);
      alert(planDetailsCopy.deleteError);
    }
  };

  const toggleWeek = (weekId: string) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekId)) {
      newExpanded.delete(weekId);
    } else {
      newExpanded.add(weekId);
    }
    setExpandedWeeks(newExpanded);
  };

  const handleAddSession = (mesocycleId: string) => {
    setSelectedMesocycleId(mesocycleId);
    setEditingSession(null);
    setIsSessionModalOpen(true);
  };

  const handleEditSession = (session: Microcycle) => {
    setSelectedMesocycleId(session.mesocycleId);
    setEditingSession(session);
    setIsSessionModalOpen(true);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm(planDetailsCopy.deleteSessionConfirm)) {
      return;
    }

    try {
      await planService.deleteSession(sessionId);
      if (id) {
        await loadPlan(id);
      }
    } catch (error) {
      console.error('Erro ao deletar sessão:', error);
      alert(planDetailsCopy.deleteSessionError);
    }
  };

  const handleSessionSubmit = async (data: Omit<CreateSessionDTO, 'mesocycleId'>) => {
    if (!selectedMesocycleId) return;

    try {
      if (editingSession) {
        // Editar sessão existente
        await planService.updateSession(editingSession.id, {
          ...data,
          mesocycleId: selectedMesocycleId,
        });
      } else {
        // Criar nova sessão
        await planService.createSession({
          ...data,
          mesocycleId: selectedMesocycleId,
        });
      }

      setIsSessionModalOpen(false);
      setSelectedMesocycleId(null);
      setEditingSession(null);

      if (id) {
        await loadPlan(id);
      }
    } catch (error) {
      console.error('Erro ao salvar sessão:', error);
      alert(planDetailsCopy.saveSessionError);
    }
  };

  const formatDate = (dateString: string) => formatDateBR(dateString);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-muted-foreground">{planDetailsCopy.loading}</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{planDetailsCopy.notFound}</p>
        <Button onClick={() => navigate('/plans')} className="mt-4">
          {planDetailsCopy.backToPlans}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/plans')}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{plan.name}</h1>
            <p className="text-muted-foreground mt-1">
              {plan.aluno.user.profile.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate(`/plans/${id}/workout-builder/1/1`)}>
            <Activity size={20} />
            {planDetailsCopy.buildWorkouts}
          </Button>
          <Button variant="outline" onClick={() => navigate(`/plans/${id}/edit`)}>
            <Edit size={20} />
            {planDetailsCopy.edit}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 size={20} />
            {planDetailsCopy.delete}
          </Button>
        </div>
      </div>

      {/* Description */}
      {plan.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{plan.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {plan.stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>{planDetailsCopy.weeks}</CardDescription>
              <CardTitle className="text-3xl">{plan.stats.totalMesocycles}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>{planDetailsCopy.sessions}</CardDescription>
              <CardTitle className="text-3xl">{plan.stats.totalMicrocycles}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>{planDetailsCopy.totalDistance}</CardDescription>
              <CardTitle className="text-3xl">{plan.stats.totalDistance.toFixed(0)} km</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>{planDetailsCopy.totalDuration}</CardDescription>
              <CardTitle className="text-3xl">
                {planService.formatDuration(plan.stats.totalDuration)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Period */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {planDetailsCopy.period}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{planDetailsCopy.start}</p>
              <p className="font-bold">{formatDate(plan.startDate)}</p>
            </div>
            <div className="text-muted-foreground">→</div>
            <div>
              <p className="text-sm text-muted-foreground">{planDetailsCopy.end}</p>
              <p className="font-bold">{formatDate(plan.endDate)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Macrocycles */}
      {plan.macrocycles && plan.macrocycles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fases do Plano</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {plan.macrocycles.map((macro) => (
                <div
                  key={macro.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-white text-sm ${planService.getPhaseColor(
                        macro.phase
                      )}`}
                    >
                      {planService.translatePhase(macro.phase)}
                    </span>
                    <span className="font-medium">{macro.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Semanas {macro.weekStart} - {macro.weekEnd}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`${
              activeTab === 'sessions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
          >
            {planDetailsCopy.trainingSessionsTab}
          </button>
          <button
            onClick={() => setActiveTab('periodization')}
            className={`${
              activeTab === 'periodization'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
          >
            {planDetailsCopy.periodizationTab}
          </button>
        </nav>
      </div>

      {/* Tab Content: Sessions */}
      {activeTab === 'sessions' && plan.macrocycles && plan.macrocycles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">{planDetailsCopy.trainingWeeks}</h2>
          </div>

          {plan.macrocycles.map((macro) =>
            macro.mesocycles.map((week) => {
              const isExpanded = expandedWeeks.has(week.id);
              const weekVolume = week.microcycles.reduce(
                (sum, session) => sum + (session.distanceKm || 0),
                0
              );

              return (
                <Card key={week.id}>
                  <CardHeader
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleWeek(week.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          Semana {week.weekNumber}
                        </CardTitle>
                        <CardDescription>
                          {formatDate(week.startDate)} - {formatDate(week.endDate)}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">{planDetailsCopy.volume}</p>
                          <p className="font-bold">{weekVolume.toFixed(1)} km</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">{planDetailsCopy.sessions}</p>
                          <p className="font-bold">{week.microcycles.length}</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-2">
                      {week.microcycles.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>{planDetailsCopy.noSessionAdded}</p>
                          <Button className="mt-4" size="sm" onClick={() => handleAddSession(week.id)}>
                            <Plus size={16} />
                            {planDetailsCopy.addSession}
                          </Button>
                        </div>
                      ) : (
                        week.microcycles
                          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                          .map((session) => (
                            <div
                              key={session.id}
                              className="flex items-center justify-between p-3 border rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <div className="text-sm font-medium w-20">
                                  {planService.getDayName(session.dayOfWeek)}
                                </div>
                                <span
                                  className={`text-xs px-2 py-1 rounded-full ${planService.getSessionTypeColor(
                                    session.sessionType
                                  )}`}
                                >
                                  {planService.translateSessionType(session.sessionType)}
                                </span>
                                {session.distanceKm && (
                                  <span className="text-sm text-muted-foreground">
                                    {session.distanceKm} km
                                  </span>
                                )}
                                <span className="text-sm text-muted-foreground">
                                  {planService.formatDuration(session.durationMinutes)}
                                </span>
                                {session.paceMinPerKm && (
                                  <span className="text-sm text-muted-foreground">
                                    @ {planService.formatPace(session.paceMinPerKm)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {session.intensityPercentage}% {planDetailsCopy.intensity}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditSession(session)}
                                >
                                  <Edit size={14} />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteSession(session.id)}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </div>
                          ))
                      )}
                      {week.microcycles.length > 0 && (
                        <div className="pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddSession(week.id)}
                            className="w-full"
                          >
                            <Plus size={16} />
                            {planDetailsCopy.addSession}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Empty State */}
      {(!plan.macrocycles || plan.macrocycles.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">{planDetailsCopy.emptyTitle}</h3>
            <p className="text-muted-foreground mb-4">
              {planDetailsCopy.emptyDescription}
            </p>
            <Button onClick={() => loadPlan(id!)}>
              <Activity size={20} />
              {planDetailsCopy.refresh}
            </Button>
          </CardContent>
        </Card>
      )}
      {/* Tab Content: Periodization */}
      {activeTab === 'periodization' && (
        <PeriodizationMatrixComponent planId={id!} startDate={plan.startDate} endDate={plan.endDate} />
      )}

      {/* Session Modal */}
      <SessionModal
        isOpen={isSessionModalOpen}
        onClose={() => {
          setIsSessionModalOpen(false);
          setSelectedMesocycleId(null);
          setEditingSession(null);
        }}
        onSubmit={handleSessionSubmit}
        initialData={editingSession ? {
          dayOfWeek: editingSession.dayOfWeek,
          sessionType: editingSession.sessionType,
          durationMinutes: editingSession.durationMinutes,
          distanceKm: editingSession.distanceKm,
          intensityPercentage: editingSession.intensityPercentage,
          paceMinPerKm: editingSession.paceMinPerKm,
          heartRateZone: editingSession.heartRateZone,
          instructions: editingSession.instructions,
          notes: editingSession.notes,
        } : undefined}
        isEditMode={!!editingSession}
      />
    </div>
  );
}

