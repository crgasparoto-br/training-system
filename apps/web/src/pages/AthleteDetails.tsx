import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { athleteService, type Athlete } from '../services/athlete.service';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import {
  ArrowLeft,
  Edit,
  Trash2,
  User,
  Activity,
  Heart,
  TrendingUp,
  Calendar,
  Phone,
  Mail,
} from 'lucide-react';

export function AthleteDetails() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [hrZones, setHrZones] = useState<any>(null);

  useEffect(() => {
    if (id) {
      loadAthlete(id);
    }
  }, [id]);

  const loadAthlete = async (athleteId: string) => {
    setLoading(true);
    try {
      const data: any = await athleteService.getById(athleteId);
      setAthlete(data);
      
      // Calcular zonas de FC
      if (data.calculated?.hrZones) {
        setHrZones(data.calculated.hrZones);
      }
    } catch (error) {
      console.error('Erro ao carregar atleta:', error);
      alert('Erro ao carregar atleta');
      navigate('/athletes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Tem certeza que deseja deletar este atleta?')) {
      return;
    }

    try {
      await athleteService.delete(id);
      alert('Atleta deletado com sucesso!');
      navigate('/athletes');
    } catch (error) {
      console.error('Erro ao deletar atleta:', error);
      alert('Erro ao deletar atleta');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando atleta...</p>
        </div>
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Atleta não encontrado</p>
        <Button onClick={() => navigate('/athletes')} className="mt-4">
          Voltar para Atletas
        </Button>
      </div>
    );
  }

  const bmi = athleteService.calculateBMI(athlete.weight, athlete.height);
  const bmiClass = athleteService.getBMIClassification(bmi);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/athletes')}>
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{athlete.user.profile.name}</h1>
              <p className="text-muted-foreground">{athlete.age} anos</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/athletes/${id}/edit`}>
            <Button variant="outline">
              <Edit size={20} />
              Editar
            </Button>
          </Link>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 size={20} />
            Deletar
          </Button>
        </div>
      </div>

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informações de Contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <span>{athlete.user.email}</span>
          </div>
          {athlete.user.profile.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <span>{athlete.user.profile.phone}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dados Antropométricos */}
      <Card>
        <CardHeader>
          <CardTitle>Dados Antropométricos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Peso</p>
              <p className="text-2xl font-bold">{athlete.weight} kg</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Altura</p>
              <p className="text-2xl font-bold">{athlete.height} cm</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">IMC</p>
              <p className="text-2xl font-bold">{bmi.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">{bmiClass}</p>
            </div>
            {athlete.bodyFatPercentage && (
              <div>
                <p className="text-sm text-muted-foreground">% Gordura</p>
                <p className="text-2xl font-bold">{athlete.bodyFatPercentage}%</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dados de Performance */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">VO2 Max</p>
              <p className="text-2xl font-bold">{athlete.vo2Max} ml/kg/min</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Limiar Anaeróbico</p>
              <p className="text-2xl font-bold">{athlete.anaerobicThreshold} km/h</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Frequência Cardíaca
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">FC Máxima</p>
              <p className="text-2xl font-bold">{athlete.maxHeartRate} bpm</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">FC Repouso</p>
              <p className="text-2xl font-bold">{athlete.restingHeartRate} bpm</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Zonas de Frequência Cardíaca */}
      {hrZones && (
        <Card>
          <CardHeader>
            <CardTitle>Zonas de Frequência Cardíaca</CardTitle>
            <CardDescription>Baseado no método de Karvonen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(hrZones).map(([key, zone]: [string, any]) => (
                <div key={key} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{zone.name}</p>
                    <p className="text-sm text-muted-foreground">{zone.percentage}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{zone.min} - {zone.max} bpm</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Macronutrientes */}
      {athlete.macronutrients && (
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Macronutrientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <p className="text-sm text-muted-foreground">Carboidratos</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {athlete.macronutrients.carbohydratesPercentage}%
                </p>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <p className="text-sm text-muted-foreground">Proteínas</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {athlete.macronutrients.proteinsPercentage}%
                </p>
              </div>
              <div className="text-center p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <p className="text-sm text-muted-foreground">Lipídios</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {athlete.macronutrients.lipidsPercentage}%
                </p>
              </div>
            </div>
            {athlete.macronutrients.dailyCalories && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">Calorias Diárias</p>
                <p className="text-2xl font-bold">{athlete.macronutrients.dailyCalories} kcal</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Planos de Treino e Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Planos de Treino
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum plano de treino ativo</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Progresso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Sem dados de progresso</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
