import { useState, useEffect, Fragment } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { athleteService, type Athlete } from '../services/athlete.service';
import { assessmentService, type Assessment, type AssessmentSummary, type AssessmentAuditLog } from '../services/assessment.service';
import { assessmentTypeService, type AssessmentType } from '../services/assessment-type.service';
import { assessmentHistorySections } from '../data/assessmentVariables';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import {
  ArrowLeft,
  Edit,
  Trash2,
  User,
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
  const [isResetting, setIsResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [countryCode, setCountryCode] = useState('55');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentSummary, setAssessmentSummary] = useState<AssessmentSummary[]>([]);
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([]);
  const [uploadingAssessment, setUploadingAssessment] = useState(false);
  const [assessmentForm, setAssessmentForm] = useState({
    typeId: '',
    assessmentDate: '',
    file: null as File | null,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'history'>('summary');
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [editForm, setEditForm] = useState({
    typeId: '',
    assessmentDate: '',
  });
  const [auditLogs, setAuditLogs] = useState<AssessmentAuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [historyFilterTitle, setHistoryFilterTitle] = useState('all');
  const [historyEditOpen, setHistoryEditOpen] = useState(false);
  const [historyEditSectionTitle, setHistoryEditSectionTitle] = useState('');
  const [historyEditAssessmentId, setHistoryEditAssessmentId] = useState('');
  const [historyEditValues, setHistoryEditValues] = useState<Record<string, string>>({});
  const historyTextVariables = new Set(['Protocolo', 'R. VO2máximo']);

  useEffect(() => {
    if (id) {
      loadAthlete(id);
    }
  }, [id]);

  const loadAthlete = async (athleteId: string) => {
    setLoading(true);
    try {
      const [data, assessmentsData, summaryData, typesData] = await Promise.all([
        athleteService.getById(athleteId),
        assessmentService.listByAthlete(athleteId),
        assessmentService.getSummary(athleteId),
        assessmentTypeService.list(),
      ]);

      setAthlete(data);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      setAssessmentTypes(typesData);

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

  const handleResetPassword = async () => {
    if (!id) return;
    if (!confirm('Deseja gerar uma nova senha temporária para este atleta?')) {
      return;
    }

    setIsResetting(true);
    setCopied(false);
    setMessageCopied(false);
    try {
      const result = await athleteService.resetPassword(id);
      setTempPassword(result.tempPassword);
      const phoneDigits = athlete?.user.profile.phone?.replace(/\D/g, '') || '';
      if (phoneDigits.startsWith('55')) {
        setCountryCode('55');
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao resetar senha');
    } finally {
      setIsResetting(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      alert('Não foi possível copiar a senha automaticamente');
    }
  };

  const buildMessage = () => {
    if (!tempPassword || !athlete) return '';
    return `Olá ${athlete.user.profile.name}, sua senha temporária é ${tempPassword}.`;
  };

  const handleCopyMessage = async () => {
    const message = buildMessage();
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setMessageCopied(true);
    } catch {
      alert('Não foi possível copiar a mensagem automaticamente');
    }
  };

  const handleSendEmail = () => {
    if (!athlete || !tempPassword) return;
    const subject = encodeURIComponent('Senha temporária de acesso');
    const body = encodeURIComponent(buildMessage());
    window.location.href = `mailto:${athlete.user.email}?subject=${subject}&body=${body}`;
  };

  const handleSendWhatsApp = () => {
    if (!athlete || !tempPassword) return;
    const rawPhone = athlete.user.profile.phone || '';
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) {
      alert('Telefone do atleta não informado');
      return;
    }
    const normalized =
      digits.length === 10 || digits.length === 11 ? `${countryCode}${digits}` : digits;
    const text = encodeURIComponent(buildMessage());
    window.open(`https://wa.me/${normalized}?text=${text}`, '_blank');
  };

  const handleClearTempPassword = () => {
    setTempPassword(null);
    setCopied(false);
    setMessageCopied(false);
  };

  const handleAssessmentUpload = async () => {
    if (!id) return;
    if (!assessmentForm.typeId || !assessmentForm.file) {
      alert('Selecione o tipo e o arquivo PDF da avaliação.');
      return;
    }

    setUploadingAssessment(true);
    try {
      await assessmentService.uploadAssessment(id, {
        typeId: assessmentForm.typeId,
        assessmentDate: assessmentForm.assessmentDate || undefined,
        file: assessmentForm.file,
      });
      const [assessmentsData, summaryData] = await Promise.all([
        assessmentService.listByAthlete(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      setAssessmentForm({ typeId: '', assessmentDate: '', file: null });
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao enviar avaliação');
    } finally {
      setUploadingAssessment(false);
    }
  };

  const handleDownloadAssessment = async (assessment: Assessment) => {
    if (!id) return;
    try {
      const blob = await assessmentService.downloadFile(id, assessment.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = assessment.originalFileName || 'avaliacao.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao baixar arquivo');
    }
  };

  const handlePreviewAssessment = async (assessment: Assessment) => {
    if (!id) return;
    setPreviewLoading(true);
    try {
      const blob = await assessmentService.downloadFile(id, assessment.id);
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewName(assessment.originalFileName || 'Avaliação');
      setPreviewOpen(true);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao visualizar arquivo');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewName('');
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const formatDateForInput = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const openEditAssessment = (assessment: Assessment) => {
    if (assessment.extractedData?.parseOk === false) {
      showToast('PDF corrompido: não é possível editar esta avaliação.', 'error');
      return;
    }
    setEditingAssessment(assessment);
    setEditForm({
      typeId: assessment.typeId,
      assessmentDate: assessment.assessmentDate ? formatDateForInput(assessment.assessmentDate) : '',
    });
    if (id) {
      setLogsLoading(true);
      assessmentService
        .getLogs(id, assessment.id)
        .then(setAuditLogs)
        .catch(() => setAuditLogs([]))
        .finally(() => setLogsLoading(false));
    }
  };

  const handleUpdateAssessment = async () => {
    if (!id || !editingAssessment) return;
    try {
      await assessmentService.updateAssessment(id, editingAssessment.id, {
        typeId: editForm.typeId,
        assessmentDate: editForm.assessmentDate || undefined,
      });
      const [assessmentsData, summaryData] = await Promise.all([
        assessmentService.listByAthlete(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      setEditingAssessment(null);
      showToast('Avaliação atualizada com sucesso', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Erro ao atualizar avaliação', 'error');
    }
  };

  const handleDeleteAssessment = async (assessment: Assessment) => {
    if (!id) return;
    if (!confirm('Deseja excluir esta avaliação?')) return;
    try {
      await assessmentService.deleteAssessment(id, assessment.id);
      const [assessmentsData, summaryData] = await Promise.all([
        assessmentService.listByAthlete(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      showToast('Avaliação excluída com sucesso', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Erro ao excluir avaliação', 'error');
    }
  };

  const handleReprocessAssessment = async (assessment: Assessment) => {
    if (!id) return;
    try {
      await assessmentService.reprocessAssessment(id, assessment.id);
      const [assessmentsData, summaryData] = await Promise.all([
        assessmentService.listByAthlete(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      showToast('Avaliação reprocessada com sucesso', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Erro ao reprocessar avaliação', 'error');
    }
  };

  const latestAssessment = assessments[0];
  const latestMetrics = latestAssessment?.extractedData?.metrics || {};

  const summaryFields = [
    { label: 'Peso', key: 'peso', unit: 'kg' },
    { label: '% Gordura', key: 'percent_gordura', unit: '%' },
    { label: 'VO2Máx (ml)', key: 'vo2max_ml', unit: 'ml/kg/min' },
    { label: 'VO2Máx (MET)', key: 'vo2max_met', unit: 'MET', computed: true },
    { label: 'FC Rep', key: 'fc_rep', unit: 'bpm' },
    { label: 'FC Máx', key: 'fc_max', unit: 'bpm' },
    { label: 'MM', key: 'massa_magra', unit: 'kg', computed: true },
    { label: 'Lan Km/h', key: 'limiar_anaerobio_kmh', unit: 'km/h' },
    { label: 'Lan FC', key: 'limiar_anaerobio_fc', unit: 'bpm' },
    { label: 'G.A', key: 'gordura_absoluta', unit: 'kg', computed: true },
    { label: 'TMB/dia', key: 'tmb_dia', unit: 'kcal' },
    { label: 'CIT Méd Ant.', key: 'cit_med_ant', unit: '', computed: true, pending: true },
  ];

  const toNumber = (value: any) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      let cleaned = value.trim();
      if (cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      }
      cleaned = cleaned.replace(/[^\d.-]/g, '');
      if (!cleaned) return null;
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const formatValue = (value: any) => {
    const numeric = toNumber(value);
    if (numeric === null) return '—';
    return numeric.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  };

  const getHistoryValue = (assessment: Assessment, variable: string) => {
    const source =
      assessment.extractedData?.variables?.[variable] ??
      assessment.extractedData?.history?.[variable] ??
      assessment.extractedData?.[variable];
    return source ?? null;
  };

  const sortedAssessments = [...assessments].sort(
    (a, b) => new Date(a.assessmentDate).getTime() - new Date(b.assessmentDate).getTime()
  );
  const historyTitles = Array.from(
    new Set(assessmentHistorySections.map((section) => section.title))
  );
  const filteredHistorySections = assessmentHistorySections.filter(
    (section) => historyFilterTitle === 'all' || section.title === historyFilterTitle
  );

  const buildHistoryEditValues = (sectionTitle: string, assessmentId: string) => {
    const sectionVariables = assessmentHistorySections
      .filter((section) => section.title === sectionTitle)
      .flatMap((section) => section.variables);
    const assessment = assessments.find((item) => item.id === assessmentId);
    const values: Record<string, string> = {};
    sectionVariables.forEach((variable) => {
      const currentValue = assessment ? getHistoryValue(assessment, variable) : null;
      values[variable] = currentValue === null || currentValue === undefined ? '' : String(currentValue);
    });
    return values;
  };

  const openHistoryEdit = (sectionTitle?: string) => {
    const latestAssessment = sortedAssessments[sortedAssessments.length - 1];
    const selectedSection =
      sectionTitle ||
      (historyFilterTitle !== 'all' ? historyFilterTitle : historyTitles[0]) ||
      '';
    const selectedAssessmentId = latestAssessment?.id || '';
    setHistoryEditSectionTitle(selectedSection);
    setHistoryEditAssessmentId(selectedAssessmentId);
    if (selectedSection && selectedAssessmentId) {
      setHistoryEditValues(buildHistoryEditValues(selectedSection, selectedAssessmentId));
    } else {
      setHistoryEditValues({});
    }
    setHistoryEditOpen(true);
  };

  const handleSaveHistoryEdit = async () => {
    if (!id || !historyEditAssessmentId || !historyEditSectionTitle) return;
    const targetAssessment = assessments.find((item) => item.id === historyEditAssessmentId);
    if (targetAssessment?.extractedData?.parseOk === false) {
      showToast('PDF corrompido: não é possível editar esta avaliação.', 'error');
      return;
    }
    const payload: Record<string, number | string | null> = {};
    Object.entries(historyEditValues).forEach(([key, value]) => {
      if (value === '') {
        payload[key] = null;
      } else if (historyTextVariables.has(key)) {
        payload[key] = value;
      } else {
        payload[key] = toNumber(value);
      }
    });
    try {
      await assessmentService.updateAssessment(id, historyEditAssessmentId, {
        variables: payload,
      });
      const [assessmentsData, summaryData] = await Promise.all([
        assessmentService.listByAthlete(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      setHistoryEditOpen(false);
      showToast('Histórico atualizado com sucesso', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Erro ao atualizar histórico', 'error');
    }
  };

  const historyEditSectionVariables = historyEditSectionTitle
    ? assessmentHistorySections
        .filter((section) => section.title === historyEditSectionTitle)
        .flatMap((section) => section.variables)
    : [];

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
          <Button variant="outline" onClick={handleResetPassword} isLoading={isResetting}>
            Resetar Senha
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 size={20} />
            Deletar
          </Button>
        </div>
      </div>

      {/* Contact Info */}
      {tempPassword && (
        <Card>
          <CardHeader>
            <CardTitle>Senha Temporária</CardTitle>
            <CardDescription>Compartilhe esta senha com o atleta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="font-mono text-lg">{tempPassword}</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCopyPassword}>
                  {copied ? 'Copiado' : 'Copiar senha'}
                </Button>
                <Button variant="outline" onClick={handleClearTempPassword}>
                  Limpar
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleCopyMessage}>
                {messageCopied ? 'Mensagem copiada' : 'Copiar mensagem'}
              </Button>
              <Button
                variant="outline"
                onClick={handleSendEmail}
                disabled={!athlete.user.email}
              >
                Enviar por Email
              </Button>
              <div className="flex items-center gap-2">
                <select
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value)}
                >
                  <option value="55">+55 Brasil</option>
                  <option value="1">+1 EUA</option>
                  <option value="351">+351 Portugal</option>
                </select>
                <Button
                  variant="outline"
                  onClick={handleSendWhatsApp}
                  disabled={!athlete.user.profile.phone}
                >
                  Enviar por WhatsApp
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
          {athlete.lastPasswordResetAt && (
            <div className="text-xs text-muted-foreground">
              Último reset de senha: {new Date(athlete.lastPasswordResetAt).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'summary'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground'
          }`}
        >
          Resumo
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'history'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground'
          }`}
        >
          Histórico
        </button>
      </div>

      {activeTab === 'summary' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Resumo da Avaliação</CardTitle>
              <CardDescription>
                Dados importados do PDF da avaliação mais recente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {latestAssessment ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {summaryFields.map((field) => {
                    const value = latestMetrics?.[field.key];
                    return (
                      <div key={field.key} className="rounded-lg border border-gray-200 p-3">
                        <div className="text-xs text-muted-foreground">{field.label}</div>
                        <div className="mt-1 text-lg font-semibold">
                          {formatValue(value)} {field.unit}
                        </div>
                        {field.computed && (
                          <div className="mt-1 text-[10px] text-amber-600">
                            {field.pending && !value ? 'Cálculo pendente' : 'Campo calculado'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Nenhuma avaliação registrada ainda.
                </div>
              )}
            </CardContent>
          </Card>

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

      {/* Avaliações */}
      <Card>
        <CardHeader>
          <CardTitle>Avaliações Físicas</CardTitle>
          <CardDescription>Gerencie os PDFs e o calendário de avaliações do atleta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {assessmentSummary.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nenhum tipo de avaliação configurado.
              </div>
            ) : (
              assessmentSummary.map((item) => (
                <div key={item.typeId} className="rounded-lg border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">{item.typeName}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Última: {item.lastAssessmentDate ? new Date(item.lastAssessmentDate).toLocaleDateString() : 'Não registrada'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Próxima: {item.nextDueDate ? new Date(item.nextDueDate).toLocaleDateString() : 'Não calculada'}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Nova Avaliação</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_0.8fr_1fr_auto]">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={assessmentForm.typeId}
                onChange={(event) =>
                  setAssessmentForm({ ...assessmentForm, typeId: event.target.value })
                }
              >
                <option value="">Selecione o tipo</option>
                {assessmentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={assessmentForm.assessmentDate}
                onChange={(event) =>
                  setAssessmentForm({ ...assessmentForm, assessmentDate: event.target.value })
                }
              />
              <input
                type="file"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) =>
                  setAssessmentForm({
                    ...assessmentForm,
                    file: event.target.files?.[0] || null,
                  })
                }
              />
              <Button
                type="button"
                onClick={handleAssessmentUpload}
                isLoading={uploadingAssessment}
              >
                Enviar
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
  <table className="min-w-full text-sm">
    <thead>
      <tr className="border-b text-left text-xs uppercase text-gray-500">
        <th className="px-3 py-2">Data</th>
        <th className="px-3 py-2">Tipo</th>
        <th className="px-3 py-2">Arquivo</th>
        <th className="px-3 py-2 text-right">Ações</th>
      </tr>
    </thead>
    <tbody>
      {assessments.length === 0 ? (
        <tr>
          <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
            Nenhuma avaliação registrada
          </td>
        </tr>
      ) : (
        assessments.map((assessment) => (
          <tr key={assessment.id} className="border-b">
            <td className="px-3 py-2 text-gray-700">
              {new Date(assessment.assessmentDate).toLocaleDateString()}
            </td>
            <td className="px-3 py-2 text-gray-700">
              {assessment.type?.name || 'Tipo não informado'}
            </td>
            <td className="px-3 py-2 text-gray-700">
              {assessment.originalFileName}
            </td>
            <td className="px-3 py-2 text-right">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handlePreviewAssessment(assessment)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Visualizar
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadAssessment(assessment)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Baixar
                </button>
                <button
                  type="button"
                  onClick={() => handleReprocessAssessment(assessment)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Reprocessar
                </button>
                <button
                  type="button"
                  onClick={() => openEditAssessment(assessment)}
                  disabled={assessment.extractedData?.parseOk === false}
                  className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                    assessment.extractedData?.parseOk === false
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {assessment.extractedData?.parseOk === false ? 'PDF inválido' : 'Editar'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteAssessment(assessment)}
                  className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Excluir
                </button>
              </div>
            </td>
          </tr>
        ))
      )}
    </tbody>
  </table>
</div>
        </CardContent>
      </Card>
        </>
      )}

      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Avaliações</CardTitle>
            <CardDescription>
              Comparativo das avaliações ao longo do tempo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sortedAssessments.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nenhuma avaliação registrada para exibir histórico.
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Filtrar por título</span>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={historyFilterTitle}
                      onChange={(event) => setHistoryFilterTitle(event.target.value)}
                    >
                      <option value="all">Todos</option>
                      {historyTitles.map((title) => (
                        <option key={title} value={title}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button variant="outline" onClick={() => openHistoryEdit()}>
                    Editar dados
                  </Button>
                </div>
                {filteredHistorySections.map((section) => (
                  <div key={`${section.title}-${section.subtitle || 'main'}`}>
                    <div className="flex items-baseline gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
                      {section.subtitle && (
                        <span className="text-xs text-muted-foreground">• {section.subtitle}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => openHistoryEdit(section.title)}
                        className="ml-auto rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Editar dados
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
  <table className="min-w-full text-sm">
    <thead>
      <tr className="bg-muted text-left text-xs uppercase text-gray-500">
        <th className="px-3 py-2">Variável</th>
        {sortedAssessments.map((assessment) => (
          <th key={assessment.id} className="px-3 py-2" colSpan={2}>
            {new Date(assessment.assessmentDate).toLocaleDateString()}
          </th>
        ))}
        <th className="px-3 py-2">Δ% Total</th>
      </tr>
      <tr className="border-b text-left text-xs uppercase text-gray-400">
        <th className="px-3 py-2"></th>
        {sortedAssessments.map((assessment) => (
          <Fragment key={assessment.id}>
            <th className="px-3 py-2">Valor</th>
            <th className="px-3 py-2">Δ%</th>
          </Fragment>
        ))}
        <th className="px-3 py-2"></th>
      </tr>
    </thead>
    <tbody>
      {section.variables.map((variable) => {
        const rawValues = sortedAssessments.map((assessment) =>
          getHistoryValue(assessment, variable)
        );
        const numericValues = rawValues.map((value) => toNumber(value));
        const firstValue = numericValues.find(
          (value) => value !== null && value !== undefined
        );
        const lastValue = [...numericValues]
          .reverse()
          .find((value) => value !== null && value !== undefined);
        const totalDelta =
          firstValue !== null &&
          firstValue !== undefined &&
          lastValue !== null &&
          lastValue !== undefined
            ? ((lastValue - firstValue) / firstValue) * 100
            : null;

        return (
          <tr key={variable} className="border-b">
            <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">
              {variable}
            </td>
            {rawValues.map((value, index) => {
              const prev = index > 0 ? numericValues[index - 1] : null;
              const currentNumeric = numericValues[index];
              const delta =
                prev !== null &&
                prev !== undefined &&
                currentNumeric !== null &&
                currentNumeric !== undefined
                  ? ((currentNumeric - prev) / prev) * 100
                  : null;
              return (
                <Fragment key={`${variable}-${index}`}>
                  <td className="px-3 py-2">
                    {value === null || value === undefined
                      ? '—'
                      : typeof value === 'string'
                        ? value
                        : formatValue(value)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {delta === null || !Number.isFinite(delta)
                      ? '—'
                      : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                  </td>
                </Fragment>
              );
            })}
            <td className="px-3 py-2 text-xs text-muted-foreground">
              {totalDelta === null || !Number.isFinite(totalDelta)
                ? '—'
                : `${totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(1)}%`}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={handleClosePreview} />
          <div className="relative z-10 w-[92vw] max-w-5xl h-[85vh] bg-background rounded-lg shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-sm font-semibold truncate">{previewName}</div>
              <button
                type="button"
                onClick={handleClosePreview}
                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
            <div className="flex-1 bg-black/5">
              {previewLoading || !previewUrl ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Carregando PDF...
                </div>
              ) : (
                <iframe
                  src={previewUrl}
                  title={previewName}
                  className="w-full h-full"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {historyEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setHistoryEditOpen(false)}
          />
          <div className="relative z-10 w-[92vw] max-w-3xl bg-background rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-sm font-semibold">Editar dados do histórico</div>
              <button
                type="button"
                onClick={() => setHistoryEditOpen(false)}
                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">Título</label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={historyEditSectionTitle}
                    onChange={(event) => {
                      const nextTitle = event.target.value;
                      setHistoryEditSectionTitle(nextTitle);
                      if (historyEditAssessmentId) {
                        setHistoryEditValues(buildHistoryEditValues(nextTitle, historyEditAssessmentId));
                      }
                    }}
                  >
                    {historyTitles.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Avaliação</label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={historyEditAssessmentId}
                    onChange={(event) => {
                      const nextAssessment = event.target.value;
                      setHistoryEditAssessmentId(nextAssessment);
                      if (historyEditSectionTitle) {
                        setHistoryEditValues(
                          buildHistoryEditValues(historyEditSectionTitle, nextAssessment)
                        );
                      }
                    }}
                  >
                    {sortedAssessments.map((assessment) => (
                      <option key={assessment.id} value={assessment.id}>
                        {new Date(assessment.assessmentDate).toLocaleDateString()} -{' '}
                        {assessment.type?.name || 'Tipo não informado'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="max-h-[50vh] overflow-y-auto rounded-md border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-left text-xs uppercase text-gray-500">
                      <th className="px-3 py-2">Variável</th>
                      <th className="px-3 py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyEditSectionVariables.map((variable) => (
                      <tr key={variable} className="border-b">
                        <td className="px-3 py-2 text-gray-700">{variable}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={historyEditValues[variable] ?? ''}
                            onChange={(event) =>
                              setHistoryEditValues({
                                ...historyEditValues,
                                [variable]: event.target.value,
                              })
                            }
                            placeholder="—"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setHistoryEditOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveHistoryEdit}>Salvar alterações</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingAssessment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditingAssessment(null)} />
          <div className="relative z-10 w-[92vw] max-w-lg bg-background rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-sm font-semibold">Editar Avaliação</div>
              <button
                type="button"
                onClick={() => setEditingAssessment(null)}
                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Tipo</label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={editForm.typeId}
                  onChange={(event) =>
                    setEditForm({ ...editForm, typeId: event.target.value })
                  }
                >
                  <option value="">Selecione o tipo</option>
                  {assessmentTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Data da avaliação</label>
                <input
                  type="date"
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={editForm.assessmentDate}
                  onChange={(event) =>
                    setEditForm({ ...editForm, assessmentDate: event.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingAssessment(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleUpdateAssessment}>Salvar</Button>
              </div>

              <div className="pt-2 border-t">
                <div className="text-xs font-semibold text-gray-700 mb-2">Histórico de alterações</div>
                {logsLoading ? (
                  <div className="text-xs text-muted-foreground">Carregando histórico...</div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Nenhuma alteração registrada.</div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="text-xs text-gray-600">
                        <div className="font-medium">
                          {log.action === 'update' ? 'Atualização' : 'Exclusão'}
                        </div>
                        <div>
                          {log.educator?.user?.profile?.name || 'Educador'} •{' '}
                          {new Date(log.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`rounded-lg px-4 py-2 text-sm shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}






