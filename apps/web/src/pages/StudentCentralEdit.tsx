import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { canAccessBlock } from '../access/access-control';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { alunoService, type Aluno } from '../services/aluno.service';
import { useAuthStore } from '../stores/useAuthStore';

type CentralEditForm = {
  mainGoal: string;
  trainingBackground: string;
  observations: string;
};

const emptyParqResponses = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
  q8: false,
};

function getAlunoErrorMessage(error: unknown, fallback: string) {
  const maybeError = error as { response?: { data?: { error?: string } }; message?: string };
  return maybeError.response?.data?.error || maybeError.message || fallback;
}

export function StudentCentralEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const canEditProfile = canAccessBlock(user, 'students.actions.editProfile');
  const centralPath = id ? `/central-do-aluno/${id}` : '/central-do-aluno';

  const [aluno, setAluno] = useState<Aluno | null>(null);
  const [form, setForm] = useState<CentralEditForm>({
    mainGoal: '',
    trainingBackground: '',
    observations: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setLoadError('Aluno não informado.');
      return;
    }

    const alunoId = id;
    let active = true;

    async function loadAluno() {
      setLoading(true);
      setLoadError(null);

      try {
        const data = await alunoService.getById(alunoId);

        if (!active) {
          return;
        }

        setAluno(data);
        setForm({
          mainGoal: data.intakeForm?.mainGoal || '',
          trainingBackground: data.intakeForm?.trainingBackground || '',
          observations: data.intakeForm?.observations || '',
        });
      } catch (error) {
        if (active) {
          setLoadError(getAlunoErrorMessage(error, 'Não foi possível carregar os dados do aluno.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAluno();

    return () => {
      active = false;
    };
  }, [id]);

  const handleBack = () => {
    navigate(centralPath);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!id || !aluno || !canEditProfile) {
      return;
    }

    const alunoId = id;
    setSaving(true);
    setSaveError(null);

    try {
      const intakeForm = aluno.intakeForm;

      await alunoService.update(alunoId, {
        intakeForm: {
          assessmentDate: intakeForm?.assessmentDate || undefined,
          mainGoal: form.mainGoal.trim() || undefined,
          medicalHistory: intakeForm?.medicalHistory || undefined,
          currentMedications: intakeForm?.currentMedications || undefined,
          injuriesHistory: intakeForm?.injuriesHistory || undefined,
          trainingBackground: form.trainingBackground.trim() || undefined,
          observations: form.observations.trim() || undefined,
          parqResponses: intakeForm?.parqResponses ?? emptyParqResponses,
          formResponses: intakeForm?.formResponses,
        },
      });

      navigate(centralPath);
    } catch (error) {
      setSaveError(getAlunoErrorMessage(error, 'Não foi possível salvar as alterações.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-muted-foreground">Carregando dados do aluno...</p>
        </div>
      </div>
    );
  }

  if (!canEditProfile) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para a Central
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Sem permissão para editar</CardTitle>
            <CardDescription>
              Você pode continuar acompanhando a ficha do aluno, mas não tem acesso para alterar dados cadastrais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleBack}>Ver ficha do aluno</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError || !aluno) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Button variant="ghost" onClick={() => navigate('/central-do-aluno')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para a Central
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Não foi possível abrir a edição</CardTitle>
            <CardDescription>{loadError || 'Aluno não encontrado.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/central-do-aluno')}>Buscar outro aluno</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alunoName = aluno.user.profile.name;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" className="mb-3 px-0" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para a ficha
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Editar dados da Central</h1>
          <p className="text-muted-foreground">
            Atualize os pontos principais de acompanhamento de {alunoName} sem sair do contexto da ficha.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Objetivo e observações</CardTitle>
          <CardDescription>
            Essas informações aparecem no resumo e ajudam a equipe a entender o momento atual do aluno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="mainGoal" className="text-sm font-medium">
                Objetivo principal
              </label>
              <textarea
                id="mainGoal"
                value={form.mainGoal}
                onChange={(event) => setForm((current) => ({ ...current, mainGoal: event.target.value }))}
                className="min-h-[112px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Ex.: melhorar condicionamento, reduzir dores recorrentes ou preparar uma prova."
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="trainingBackground" className="text-sm font-medium">
                Histórico de treino
              </label>
              <textarea
                id="trainingBackground"
                value={form.trainingBackground}
                onChange={(event) => setForm((current) => ({ ...current, trainingBackground: event.target.value }))}
                className="min-h-[112px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Descreva experiências recentes, pausas, limitações ou referências úteis para o planejamento."
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="observations" className="text-sm font-medium">
                Observações de acompanhamento
              </label>
              <textarea
                id="observations"
                value={form.observations}
                onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))}
                className="min-h-[112px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Inclua combinados, pontos de atenção ou informações que a equipe deve revisar antes do atendimento."
              />
            </div>

            {saveError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {saveError}
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={handleBack} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Salvando...' : 'Salvar e voltar para a ficha'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
