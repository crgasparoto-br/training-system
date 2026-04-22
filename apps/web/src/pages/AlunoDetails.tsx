import { useState, useEffect, Fragment } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { useMemo, useRef } from 'react';
import { alunoService, type Aluno } from '../services/aluno.service';
import { planService, type TrainingPlan } from '../services/plan.service';
import { assessmentService, type Assessment, type AssessmentSummary, type AssessmentAuditLog } from '../services/assessment.service';
import { assessmentTypeService, type AssessmentType } from '../services/assessment-type.service';
import { assessmentHistorySections } from '../data/assessmentVariables';
import { Button } from '../components/ui/Button';
import { formatDateBR, isDateWithinRange } from '../utils/date';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/Accordion';
import { ProfessorManualContextPanel } from '../components/ProfessorManualContextPanel';
import { alunoDetailsCopy } from '../i18n/ptBR';
import { useAuthStore } from '../stores/useAuthStore';
import {
  ArrowLeft,
  Edit,
  Trash2,
  User,
  TrendingUp,
  Calendar,
  Phone,
  Mail,
  Sparkles,
} from 'lucide-react';

const ASSESSMENT_GUIDE_STORAGE_PREFIX = 'assessment-first-use-banner';

type AssessmentProtocolGuidance = {
  badge: string;
  whenToUse: string;
  required: string;
  commonError: string;
  trainingRelation: string;
  methodHint: string;
};

type AssessmentUploadFeedback = {
  typeName: string;
  assessmentDate: string | null;
  hasTrainingPlan: boolean;
};

const getAssessmentProtocolGuidance = (
  assessmentType: AssessmentType | null
): AssessmentProtocolGuidance | null => {
  if (!assessmentType) {
    return null;
  }

  const normalizedCode = assessmentType.code.toLowerCase();
  const normalizedName = assessmentType.name.toLowerCase();

  if (normalizedCode.includes('intermediate') || normalizedName.includes('intermedi')) {
    return {
      badge: 'Revisao de acompanhamento',
      whenToUse:
        'Use quando o objetivo for revisar a evolucao entre duas avaliacoes amplas ou acompanhar um setor especifico sem refazer toda a bateria.',
      required:
        'Confirme que houve coleta real do protocolo intermediario, mantenha a data correta e anexe o PDF correspondente ao momento da revisao.',
      commonError:
        'Registrar como intermediaria uma avaliacao que, na pratica, foi completa ou deixar o arquivo sem relacao clara com o historico recente do aluno.',
      trainingRelation:
        'Ela ajuda a ajustar volume, progressao e pontos de atencao do treino sem redefinir todo o planejamento do ciclo.',
      methodHint:
        'Antes de salvar, confira se a revisao responde a uma duvida operacional concreta do treino atual e se o historico continua legivel.',
    };
  }

  if (normalizedCode.includes('complete') || normalizedName.includes('completa')) {
    return {
      badge: 'Protocolo de referencia',
      whenToUse:
        'Use para entrada, reavaliacoes amplas ou momentos em que a equipe precisa de uma leitura global do aluno antes de revisar o plano.',
      required:
        'Nao pode faltar a data correta, o PDF consolidado da coleta e a confirmacao de que o arquivo representa a avaliacao principal daquele dia.',
      commonError:
        'Subir uma coleta parcial como se fosse avaliacao completa. Isso distorce o historico, o calendario e a interpretacao da evolucao.',
      trainingRelation:
        'Ela vira a principal base para revisar objetivos, coerencia do mesociclo e prioridades de progressao nas proximas semanas.',
      methodHint:
        'Se a avaliacao vai orientar um novo bloco de treino, revise se o arquivo entregue responde ao quadro geral do aluno e nao apenas a um setor isolado.',
    };
  }

  return {
    badge: 'Protocolo contextual',
    whenToUse:
      'Use quando esse tipo for o protocolo realmente aplicado no atendimento. O importante e manter o historico fiel ao que aconteceu na pratica.',
    required:
      'Garanta data correta, anexo coerente com o protocolo escolhido e uma leitura minima do impacto dessa coleta no acompanhamento do aluno.',
    commonError:
      'Escolher o tipo apenas para preencher o calendario, sem relacao com a coleta realizada ou com a interpretacao esperada pela equipe.',
    trainingRelation:
      'O registro precisa ajudar a explicar uma decisao de treino, um ajuste de monitoramento ou um proximo checkpoint do acompanhamento.',
    methodHint:
      'Quando houver duvida, prefira o protocolo que deixa mais claro para o proximo professor o que foi medido, por que foi medido e o que deve ser revisado depois.',
  };
};

const getAssessmentProtocolCadence = (
  assessmentType: AssessmentType | null,
  assessmentTypes: AssessmentType[]
): string | null => {
  if (!assessmentType) {
    return null;
  }

  if (assessmentType.scheduleType === 'fixed_interval' && assessmentType.intervalMonths) {
    return assessmentType.intervalMonths === 1
      ? 'A cada 1 mes'
      : `A cada ${assessmentType.intervalMonths} meses`;
  }

  if (assessmentType.scheduleType === 'after_type') {
    const previousType = assessmentTypes.find((type) => type.id === assessmentType.afterTypeId);

    if (previousType && assessmentType.offsetMonths != null) {
      return assessmentType.offsetMonths === 1
        ? `1 mes apos ${previousType.name}`
        : `${assessmentType.offsetMonths} meses apos ${previousType.name}`;
    }

    if (previousType) {
      return `Depois de ${previousType.name}`;
    }

    return 'Depende do protocolo anterior configurado';
  }

  return null;
};

export function AlunoDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const initialTempPassword =
    (location.state as { tempPassword?: string | null } | null)?.tempPassword ?? null;
  const [aluno, setAluno] = useState<Aluno | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(initialTempPassword);
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
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
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
  const [showAssessmentGuideBanner, setShowAssessmentGuideBanner] = useState(false);
  const [assessmentGuideActive, setAssessmentGuideActive] = useState(false);
  const [assessmentGuideStep, setAssessmentGuideStep] = useState(0);
  const [assessmentProtocolPanelExpanded, setAssessmentProtocolPanelExpanded] = useState(true);
  const [assessmentUploadFeedback, setAssessmentUploadFeedback] =
    useState<AssessmentUploadFeedback | null>(null);
  const newAssessmentRef = useRef<HTMLDivElement | null>(null);
  const assessmentSummaryRef = useRef<HTMLDivElement | null>(null);
  const assessmentTypeFieldRef = useRef<HTMLDivElement | null>(null);
  const assessmentDateFieldRef = useRef<HTMLDivElement | null>(null);
  const assessmentFileFieldRef = useRef<HTMLDivElement | null>(null);
  const assessmentSubmitRef = useRef<HTMLDivElement | null>(null);
  const historyTextVariables = new Set(['Protocolo', 'R. VO2máximo', 'Tipo de Dieta']);
  const historyVariableColumnWidthClass = 'w-56';
  const historyVariableLabelMap: Record<string, string> = {
    'Br. Dir. Rel.': 'Braço Direito Relaxado',
    'Br. Dir. Con.': 'Braço Direito Contraído',
    'Br. Esq. Rel.': 'Braço Esquerdo Relaxado',
    'Br. Esq. Con.': 'Braço Esquerdo Contraído',
    'Coxa Dir.': 'Coxa Direita',
    'Perna Dir.': 'Perna Direita',
    'Coxa Esq.': 'Coxa Esquerda',
    'Perna Esq.': 'Perna Esquerda',
    'D.C. Tricipital': 'Dobra Cutânea Tricipital',
    'D.C. Subescapular': 'Dobra Cutânea Subescapular',
    'D.C. Suprailíaca': 'Dobra Cutânea Suprailíaca',
    'D.C. Abdominal': 'Dobra Cutânea Abdominal',
    'D.C. Coxa': 'Dobra Cutânea Coxa',
    'M. Perna Direita': 'Massa Muscular Perna Direita',
    'M. Perna Esquerda': 'Massa Muscular Perna Esquerda',
    'M. Braço Direito': 'Massa Muscular Braço Direito',
    'M. Braço Esquerdo': 'Massa Muscular Braço Esquerdo',
    'M. Tronco': 'Massa Muscular Tronco',
    'G. Perna Direita': 'Gordura Perna Direita',
    'G. Perna Esquerda': 'Gordura Perna Esquerda',
    'G. Braço Direito': 'Gordura Braço Direito',
    'G. Braço Esquerdo': 'Gordura Braço Esquerdo',
    'G. Tronco': 'Gordura Tronco',
    IMC: 'Índice de Massa Corporal',
    'RML Abdominal': 'Resistência Muscular Localizada Abdominal',
    'R. Abdominal': 'Resistência Abdominal',
    'R. Flexibilidade': 'Resultado de Flexibilidade',
    'R. VO2máximo': 'Ritmo VO2máximo',
    'FC Repouso': 'Frequência Cardíaca de Repouso',
    'FC Máxima Predita': 'Frequência Cardíaca Máxima Predita',
    'FC Máxima no Teste': 'Frequência Cardíaca Máxima no Teste',
  };
  const assessmentGuideStorageKey = useMemo(() => {
    if (user?.type !== 'professor' || !user.professor?.id) {
      return null;
    }

    return `${ASSESSMENT_GUIDE_STORAGE_PREFIX}:${user.professor.id}`;
  }, [user]);
  const shouldOfferAssessmentGuide =
    user?.type === 'professor' && assessments.length === 0;
  const assessmentGuideSteps = useMemo(
    () => [
      {
        title: alunoDetailsCopy.assessmentGuideStepSummaryTitle,
        description: alunoDetailsCopy.assessmentGuideStepSummaryDescription,
        ref: assessmentSummaryRef,
      },
      {
        title: alunoDetailsCopy.assessmentGuideStepTypeTitle,
        description: alunoDetailsCopy.assessmentGuideStepTypeDescription,
        ref: assessmentTypeFieldRef,
      },
      {
        title: alunoDetailsCopy.assessmentGuideStepDateTitle,
        description: alunoDetailsCopy.assessmentGuideStepDateDescription,
        ref: assessmentDateFieldRef,
      },
      {
        title: alunoDetailsCopy.assessmentGuideStepFileTitle,
        description: alunoDetailsCopy.assessmentGuideStepFileDescription,
        ref: assessmentFileFieldRef,
      },
      {
        title: alunoDetailsCopy.assessmentGuideStepSubmitTitle,
        description: alunoDetailsCopy.assessmentGuideStepSubmitDescription,
        ref: assessmentSubmitRef,
      },
    ],
    []
  );
  const assessmentGuideCurrentStep = assessmentGuideSteps[assessmentGuideStep];
  const isAssessmentGuideStep = (index: number) =>
    assessmentGuideActive && assessmentGuideStep === index;
  const selectedAssessmentType = useMemo(
    () => assessmentTypes.find((type) => type.id === assessmentForm.typeId) ?? null,
    [assessmentForm.typeId, assessmentTypes]
  );
  const selectedAssessmentTypeSummary = useMemo(
    () =>
      selectedAssessmentType
        ? assessmentSummary.find((item) => item.typeId === selectedAssessmentType.id) ?? null
        : null,
    [assessmentSummary, selectedAssessmentType]
  );
  const assessmentProtocolGuidance = useMemo(
    () => getAssessmentProtocolGuidance(selectedAssessmentType),
    [selectedAssessmentType]
  );
  const assessmentProtocolCadence = useMemo(
    () => getAssessmentProtocolCadence(selectedAssessmentType, assessmentTypes),
    [assessmentTypes, selectedAssessmentType]
  );
  const assessmentSubmissionChecklist = useMemo(
    () => [
      {
        key: 'type',
        complete: Boolean(selectedAssessmentType),
        title: alunoDetailsCopy.assessmentSubmissionChecklistTypeTitle,
        description: selectedAssessmentType
          ? `${alunoDetailsCopy.assessmentSubmissionChecklistTypeDonePrefix} ${selectedAssessmentType.name}.`
          : alunoDetailsCopy.assessmentSubmissionChecklistTypePending,
      },
      {
        key: 'date',
        complete: Boolean(assessmentForm.assessmentDate),
        title: alunoDetailsCopy.assessmentSubmissionChecklistDateTitle,
        description: assessmentForm.assessmentDate
          ? `${alunoDetailsCopy.assessmentSubmissionChecklistDateDonePrefix} ${formatDateBR(
              assessmentForm.assessmentDate
            )}.`
          : alunoDetailsCopy.assessmentSubmissionChecklistDatePending,
      },
      {
        key: 'file',
        complete: Boolean(assessmentForm.file),
        title: alunoDetailsCopy.assessmentSubmissionChecklistFileTitle,
        description: assessmentForm.file
          ? `${alunoDetailsCopy.assessmentSubmissionChecklistFileDonePrefix} ${assessmentForm.file.name}.`
          : alunoDetailsCopy.assessmentSubmissionChecklistFilePending,
      },
      {
        key: 'history',
        complete: Boolean(selectedAssessmentType),
        title: alunoDetailsCopy.assessmentSubmissionChecklistHistoryTitle,
        description: selectedAssessmentTypeSummary?.lastAssessmentDate
          ? `${alunoDetailsCopy.assessmentSubmissionChecklistHistoryDonePrefix} ${formatDateBR(
              selectedAssessmentTypeSummary.lastAssessmentDate
            )}.`
          : selectedAssessmentType
            ? alunoDetailsCopy.assessmentSubmissionChecklistHistoryFirstRecord
            : alunoDetailsCopy.assessmentSubmissionChecklistHistoryPending,
      },
    ],
    [assessmentForm.assessmentDate, assessmentForm.file, selectedAssessmentType, selectedAssessmentTypeSummary]
  );
  const assessmentSubmissionPendingCount = assessmentSubmissionChecklist.filter(
    (item) => !item.complete
  ).length;

  useEffect(() => {
    if (id) {
      loadAluno(id);
    }
  }, [id]);

  useEffect(() => {
    if (!shouldOfferAssessmentGuide || !assessmentGuideStorageKey) {
      setShowAssessmentGuideBanner(false);
      return;
    }

    const storedValue = window.localStorage.getItem(assessmentGuideStorageKey);
    setShowAssessmentGuideBanner(storedValue !== 'hidden');
  }, [assessmentGuideStorageKey, shouldOfferAssessmentGuide]);

  useEffect(() => {
    if (!assessmentGuideActive) {
      return;
    }

    assessmentGuideCurrentStep?.ref.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [assessmentGuideActive, assessmentGuideCurrentStep]);

  useEffect(() => {
    if (assessmentForm.typeId) {
      setAssessmentProtocolPanelExpanded(true);
    }
  }, [assessmentForm.typeId]);

  const loadAluno = async (alunoId: string) => {
    setLoading(true);
    try {
      const [data, assessmentsData, summaryData, typesData, plansData] = await Promise.all([
        alunoService.getById(alunoId),
        assessmentService.listByAluno(alunoId),
        assessmentService.getSummary(alunoId),
        assessmentTypeService.list(),
        planService.listByAluno(alunoId),
      ]);

      setAluno(data);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      setAssessmentTypes(typesData);
      setPlans(plansData.plans);

    } catch (error) {
      console.error('Erro ao carregar aluno:', error);
      alert(alunoDetailsCopy.loadError);
      navigate('/alunos');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm(alunoDetailsCopy.deleteConfirm)) {
      return;
    }

    try {
      await alunoService.delete(id);
      alert(alunoDetailsCopy.deleteSuccess);
      navigate('/alunos');
    } catch (error) {
      console.error('Erro ao excluir aluno:', error);
      alert(alunoDetailsCopy.deleteError);
    }
  };

  const handleResetPassword = async () => {
    if (!id) return;
    if (!confirm(alunoDetailsCopy.resetPasswordConfirm)) {
      return;
    }

    setIsResetting(true);
    setCopied(false);
    setMessageCopied(false);
    try {
      const result = await alunoService.resetPassword(id);
      setTempPassword(result.tempPassword);
      const phoneDigits = aluno?.user.profile.phone?.replace(/\D/g, '') || '';
      if (phoneDigits.startsWith('55')) {
        setCountryCode('55');
      }
    } catch (error: any) {
      alert(error.response?.data?.error || alunoDetailsCopy.resetPasswordError);
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
      alert(alunoDetailsCopy.copyPasswordError);
    }
  };

  const buildMessage = () => {
    if (!tempPassword || !aluno) return '';
    return `Olá ${aluno.user.profile.name}, sua senha temporária é ${tempPassword}.`;
  };

  const handleCopyMessage = async () => {
    const message = buildMessage();
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setMessageCopied(true);
    } catch {
      alert(alunoDetailsCopy.copyMessageError);
    }
  };

  const handleSendEmail = () => {
    if (!aluno || !tempPassword) return;
    const subject = encodeURIComponent('Senha temporária de acesso');
    const body = encodeURIComponent(buildMessage());
    window.location.href = `mailto:${aluno.user.email}?subject=${subject}&body=${body}`;
  };

  const handleSendWhatsApp = () => {
    if (!aluno || !tempPassword) return;
    const rawPhone = aluno.user.profile.phone || '';
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) {
      alert(alunoDetailsCopy.missingPhone);
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
      alert(alunoDetailsCopy.uploadAssessmentValidation);
      return;
    }

    setUploadingAssessment(true);
    try {
      const uploadedTypeName =
        assessmentTypes.find((type) => type.id === assessmentForm.typeId)?.name ||
        alunoDetailsCopy.assessmentNextStepFallbackType;
      const uploadedAssessmentDate = assessmentForm.assessmentDate || null;
      await assessmentService.uploadAssessment(id, {
        typeId: assessmentForm.typeId,
        assessmentDate: assessmentForm.assessmentDate || undefined,
        file: assessmentForm.file,
      });
      const [assessmentsData, summaryData] = await Promise.all([
        assessmentService.listByAluno(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      setAssessmentForm({ typeId: '', assessmentDate: '', file: null });
      setAssessmentGuideActive(false);
      setShowAssessmentGuideBanner(false);
      setAssessmentGuideStep(0);
      setAssessmentUploadFeedback({
        typeName: uploadedTypeName,
        assessmentDate: uploadedAssessmentDate,
        hasTrainingPlan: plans.length > 0,
      });
      showToast(alunoDetailsCopy.uploadAssessmentSuccess);
    } catch (error: any) {
      alert(error.response?.data?.error || alunoDetailsCopy.uploadAssessmentError);
    } finally {
      setUploadingAssessment(false);
    }
  };

  const handleStartAssessmentGuide = () => {
    setAssessmentGuideActive(true);
    setShowAssessmentGuideBanner(false);
    setAssessmentGuideStep(0);

    window.requestAnimationFrame(() => {
      newAssessmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleHideAssessmentGuidePermanently = () => {
    if (assessmentGuideStorageKey) {
      window.localStorage.setItem(assessmentGuideStorageKey, 'hidden');
    }

    setShowAssessmentGuideBanner(false);
    setAssessmentGuideActive(false);
    setAssessmentGuideStep(0);
  };

  const handleNextAssessmentGuideStep = () => {
    setAssessmentGuideStep((currentStep) =>
      Math.min(currentStep + 1, assessmentGuideSteps.length - 1)
    );
  };

  const handlePreviousAssessmentGuideStep = () => {
    setAssessmentGuideStep((currentStep) => Math.max(currentStep - 1, 0));
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
      alert(error.response?.data?.error || alunoDetailsCopy.downloadError);
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
      alert(error.response?.data?.error || alunoDetailsCopy.previewError);
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
      showToast(alunoDetailsCopy.corruptedPdf, 'error');
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
        assessmentService.listByAluno(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      setEditingAssessment(null);
      showToast(alunoDetailsCopy.updateAssessmentSuccess, 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || alunoDetailsCopy.updateAssessmentError, 'error');
    }
  };

  const handleDeleteAssessment = async (assessment: Assessment) => {
    if (!id) return;
    if (!confirm(alunoDetailsCopy.deleteAssessmentConfirm)) return;
    try {
      await assessmentService.deleteAssessment(id, assessment.id);
      const [assessmentsData, summaryData] = await Promise.all([
        assessmentService.listByAluno(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      showToast(alunoDetailsCopy.deleteAssessmentSuccess, 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || alunoDetailsCopy.deleteAssessmentError, 'error');
    }
  };

  const handleReprocessAssessment = async (assessment: Assessment) => {
    if (!id) return;
    try {
      await assessmentService.reprocessAssessment(id, assessment.id);
      const [assessmentsData, summaryData] = await Promise.all([
        assessmentService.listByAluno(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      showToast(alunoDetailsCopy.reprocessAssessmentSuccess, 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || alunoDetailsCopy.reprocessAssessmentError, 'error');
    }
  };

  const latestAssessment = assessments[0];
  const latestMetrics = latestAssessment?.extractedData?.metrics || {};

  const summaryFields = [
    { label: 'Peso', key: 'peso', unit: 'kg' },
    { label: '% Gordura', key: 'percent_gordura', unit: '%' },
    { label: 'VO2Máx (ml)', key: 'vo2max_ml', unit: 'ml/kg/min' },
    { label: 'VO2Máx (MET)', key: 'vo2max_met', unit: 'MET', computed: true },
    {
      label: 'FC Repouso',
      key: 'fc_rep',
      unit: 'bpm',
      historyKeys: ['FC Repouso', 'FC Rep'],
    },
    { label: 'FC Máx', key: 'fc_max', unit: 'bpm' },
    { label: 'MM', key: 'massa_magra', unit: 'kg', computed: true },
    {
      label: 'Lan Km/h',
      key: 'limiar_anaerobio_kmh',
      unit: 'km/h',
      historyKeys: ['Limiar Anaeróbico (km/h ou watt)', 'Lan Km/h'],
    },
    {
      label: 'Lan FC',
      key: 'limiar_anaerobio_fc',
      unit: 'bpm',
      historyKeys: ['Limiar Anaeróbico (bpm)', 'Lan FC'],
    },
    { label: 'Gordura Absoluta', key: 'gordura_absoluta', unit: 'kg', computed: true },
    { label: 'TMB/dia', key: 'tmb_dia', unit: 'kcal' },
    { label: 'CIT Méd Ant.', key: 'cit_med_ant', unit: '', computed: true, pending: true },
  ];
  const vo2IntensityRows = [
    { percent: '50%', color: '#d9eac3', epe: '01' },
    { percent: '55%', color: '#d9eac3', epe: '02' },
    { percent: '60%', color: '#cfe3a6', epe: '02-03' },
    { percent: '65%', color: '#fff400', epe: '03' },
    { percent: '70%', color: '#fff400', epe: '03-04' },
    { percent: '75%', color: '#ffe600', epe: '04' },
    { percent: '80%', color: '#ffd400', epe: '05' },
    { percent: '85%', color: '#f4a300', epe: '06' },
    { percent: '90%', color: '#f07f00', epe: '07-08' },
    { percent: '95%', color: '#d90000', epe: '09' },
    { percent: '100%', color: '#b30000', epe: '10' },
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
  const formatOneDecimal = (value: any) => {
    const numeric = toNumber(value);
    if (numeric === null) return '—';
    return numeric.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  const formatDate = (value: string) => formatDateBR(value);
  const formatGender = (value?: 'male' | 'female' | 'other') => {
    if (value === 'male') return 'Masculino';
    if (value === 'female') return 'Feminino';
    if (value === 'other') return 'Outro';
    return 'Não informado';
  };
  const schedulePlanLabel = aluno?.schedulePlan === 'fixed' ? 'Fixo' : 'Livre';
  const parqPositiveCount = Object.values(aluno?.intakeForm?.parqResponses || {}).filter(Boolean).length;

  const getHistoryValue = (assessment: Assessment, variable: string) => {
    const source =
      assessment.extractedData?.variables?.[variable] ??
      (variable === 'VAM (km/h)' ? assessment.extractedData?.variables?.['VAM'] : undefined) ??
      (variable === 'Carga Limiar (km/h)'
        ? assessment.extractedData?.variables?.['Carga Limiar']
        : undefined) ??
      assessment.extractedData?.history?.[variable] ??
      assessment.extractedData?.[variable];
    return source ?? null;
  };
  const formatHistoryVariableLabel = (variable: string) =>
    historyVariableLabelMap[variable] ?? variable;

  const sortedAssessments = [...assessments].sort(
    (a, b) => new Date(a.assessmentDate).getTime() - new Date(b.assessmentDate).getTime()
  );
  const historyTitles = Array.from(
    new Set(assessmentHistorySections.map((section) => section.title))
  );
  const filteredHistorySections = assessmentHistorySections.filter(
    (section) => historyFilterTitle === 'all' || section.title === historyFilterTitle
  );
  const historyColumnCount = 2 + sortedAssessments.length * 2;

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
      showToast(alunoDetailsCopy.corruptedPdf, 'error');
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
        assessmentService.listByAluno(id),
        assessmentService.getSummary(id),
      ]);
      setAssessments(assessmentsData);
      setAssessmentSummary(summaryData);
      setHistoryEditOpen(false);
      showToast(alunoDetailsCopy.updateHistorySuccess, 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || alunoDetailsCopy.updateHistoryError, 'error');
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
          <p className="mt-4 text-muted-foreground">{alunoDetailsCopy.loading}</p>
        </div>
      </div>
    );
  }

  if (!aluno) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{alunoDetailsCopy.notFound}</p>
        <Button onClick={() => navigate('/alunos')} className="mt-4">
          {alunoDetailsCopy.backToAlunos}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/alunos')}>
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{aluno.user.profile.name}</h1>
              <p className="text-muted-foreground">{aluno.age} anos</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/alunos/${id}/edit`}>
            <Button variant="outline">
              <Edit size={20} />
              {alunoDetailsCopy.edit}
            </Button>
          </Link>
          <Button variant="outline" onClick={handleResetPassword} isLoading={isResetting}>
            {alunoDetailsCopy.resetPassword}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 size={20} />
            {alunoDetailsCopy.delete}
          </Button>
        </div>
      </div>

      {/* Contact Info */}
      {tempPassword && (
        <Card>
          <CardHeader>
            <CardTitle>{alunoDetailsCopy.temporaryPassword}</CardTitle>
            <CardDescription>{alunoDetailsCopy.temporaryPasswordDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="font-mono text-lg">{tempPassword}</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCopyPassword}>
                  {copied ? alunoDetailsCopy.copied : alunoDetailsCopy.copyPassword}
                </Button>
                <Button variant="outline" onClick={handleClearTempPassword}>
                  {alunoDetailsCopy.clear}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleCopyMessage}>
                {messageCopied ? alunoDetailsCopy.messageCopied : alunoDetailsCopy.copyMessage}
              </Button>
              <Button
                variant="outline"
                onClick={handleSendEmail}
                disabled={!aluno.user.email}
              >
                {alunoDetailsCopy.sendByEmail}
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
                  disabled={!aluno.user.profile.phone}
                >
                  {alunoDetailsCopy.sendByWhatsApp}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle>{alunoDetailsCopy.contactInfo}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <span>{aluno.user.email}</span>
          </div>
          {aluno.user.profile.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <span>{aluno.user.profile.phone}</span>
            </div>
          )}
          {aluno.lastPasswordResetAt && (
            <div className="text-xs text-muted-foreground">
              Último reset de senha: {new Date(aluno.lastPasswordResetAt).toLocaleString()}
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
          {alunoDetailsCopy.summaryTab}
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
          {alunoDetailsCopy.historyTab}
        </button>
      </div>

      {activeTab === 'summary' && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cadastro Inicial</CardTitle>
                <CardDescription>Dados principais persistidos no cadastro do aluno.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="text-xs text-muted-foreground">Data de nascimento</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {aluno.user.profile.birthDate ? formatDateBR(aluno.user.profile.birthDate) : 'Não informada'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="text-xs text-muted-foreground">Gênero</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {formatGender(aluno.user.profile.gender)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="text-xs text-muted-foreground">Plano de agenda</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{schedulePlanLabel}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="text-xs text-muted-foreground">Pressão arterial</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {aluno.systolicPressure && aluno.diastolicPressure
                        ? `${aluno.systolicPressure}/${aluno.diastolicPressure} mmHg`
                        : 'Não informada'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Avaliação inicial complementar</CardTitle>
                <CardDescription>Resumo clínico e operacional preenchido no intake.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="text-xs text-muted-foreground">Data da avaliação inicial</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {aluno.intakeForm?.assessmentDate ? formatDateBR(aluno.intakeForm.assessmentDate) : 'Não informada'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="text-xs text-muted-foreground">Respostas positivas no PAR-Q</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{parqPositiveCount}</div>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Objetivo principal</div>
                    <div className="mt-1 text-gray-900">{aluno.intakeForm?.mainGoal || 'Não informado'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Histórico de treino</div>
                    <div className="mt-1 text-gray-900">{aluno.intakeForm?.trainingBackground || 'Não informado'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Histórico médico e restrições</div>
                    <div className="mt-1 text-gray-900">
                      {aluno.intakeForm?.medicalHistory || aluno.intakeForm?.injuriesHistory || 'Não informado'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Observações</div>
                    <div className="mt-1 text-gray-900">{aluno.intakeForm?.observations || 'Não informado'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Resumo da Avaliação</CardTitle>
              <CardDescription>
                {alunoDetailsCopy.assessmentDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {latestAssessment ? (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {summaryFields.map((field) => {
                      const historyKeys = (field as { historyKeys?: string[] }).historyKeys;
                      const historyValue =
                        historyKeys && latestAssessment
                          ? historyKeys
                              .map((key) => getHistoryValue(latestAssessment, key))
                              .find((value) => value !== null && value !== undefined)
                          : null;
                      const rawValue = latestMetrics?.[field.key] ?? historyValue;
                      const value =
                        field.key === 'vo2max_met'
                          ? (() => {
                              const vo2ml = toNumber(latestMetrics?.vo2max_ml);
                              return vo2ml !== null ? vo2ml / 3.5 : rawValue;
                            })()
                          : rawValue;
                      return (
                        <div key={field.key} className="rounded-lg border border-gray-200 p-3">
                          <div className="text-xs text-muted-foreground">{field.label}</div>
                          <div className="mt-1 text-lg font-semibold">
                            {formatValue(value)} {field.unit}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm table-fixed border-collapse">
                      <thead>
                        <tr className="bg-muted text-xs uppercase text-gray-500">
                          <th className="px-3 py-2 text-left w-24">% VO2Máx</th>
                          <th className="px-3 py-2 text-center">FC (min)</th>
                          <th className="px-3 py-2 text-center">FC (15”)</th>
                          <th className="px-3 py-2 text-center">Vel (km/h)</th>
                          <th className="px-3 py-2 text-center">Pace (min/km)</th>
                          <th className="px-3 py-2 text-center">EPE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vo2IntensityRows.map((row) => {
                          const percentValue = Number(row.percent.replace('%', '')) / 100;
                          const fcRep = toNumber(
                            latestMetrics?.fc_rep ??
                              (latestAssessment
                                ? getHistoryValue(latestAssessment, 'FC Repouso')
                                : null)
                          );
                          const fcMax = toNumber(
                            latestMetrics?.fc_max ??
                              (latestAssessment
                                ? getHistoryValue(latestAssessment, 'FC Máxima no Teste') ??
                                  getHistoryValue(latestAssessment, 'FC Máxima Predita')
                                : null)
                          );
                          const fcMinValue =
                            fcRep !== null && fcMax !== null
                              ? fcRep + (fcMax - fcRep) * percentValue
                              : null;
                          const vamValue = toNumber(
                            latestAssessment
                              ? getHistoryValue(latestAssessment, 'VAM (km/h)') ??
                                  getHistoryValue(latestAssessment, 'VAM')
                              : null
                          );
                          const velValue = vamValue !== null ? vamValue * percentValue : null;

                          return (
                            <tr
                              key={row.percent}
                              className="border-b border-black/15 text-center last:border-b-0"
                              style={{
                                backgroundColor: row.color,
                                color: percentValue >= 0.9 ? '#ffffff' : '#111111',
                              }}
                            >
                              <td className="px-3 py-2 text-left font-semibold">
                                {row.percent}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {formatOneDecimal(fcMinValue)}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {formatOneDecimal(fcMinValue === null ? null : fcMinValue / 4)}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {formatOneDecimal(velValue)}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {formatOneDecimal(
                                  velValue !== null && velValue !== 0 ? 60 / velValue : null
                                )}
                              </td>
                              <td className="px-3 py-2 font-semibold">{row.epe}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {alunoDetailsCopy.noAssessmentYet}
                </div>
              )}
            </CardContent>
          </Card>

      {/* Macronutrientes */}
      {aluno.macronutrients && (
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Macronutrientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-info/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Carboidratos</p>
                <p className="text-2xl font-bold text-info">
                  {aluno.macronutrients.carbohydratesPercentage}%
                </p>
              </div>
              <div className="text-center p-4 bg-success/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Proteínas</p>
                <p className="text-2xl font-bold text-success">
                  {aluno.macronutrients.proteinsPercentage}%
                </p>
              </div>
              <div className="text-center p-4 bg-warning/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Lipídios</p>
                <p className="text-2xl font-bold text-warning">
                  {aluno.macronutrients.lipidsPercentage}%
                </p>
              </div>
            </div>
            {aluno.macronutrients.dailyCalories && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">Calorias Diárias</p>
                <p className="text-2xl font-bold">{aluno.macronutrients.dailyCalories} kcal</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Planos de Treino e Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Planos de Treino
              </CardTitle>
              <Link to={`/plans/new?alunoId=${id}`}>
                <Button variant="outline" size="sm">
                  Novo Plano
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>{alunoDetailsCopy.noTrainingPlan}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {plans.map((plan) => {
                  const now = new Date();
                  const isActive = isDateWithinRange(now, plan.startDate, plan.endDate);
                  return (
                    <div
                      key={plan.id}
                      className="rounded-lg border border-gray-200 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(plan.startDate)} - {formatDate(plan.endDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] px-2 py-1 rounded-full ${
                              isActive
                                ? 'bg-success/10 text-success'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isActive ? 'Ativo' : 'Finalizado'}
                          </span>
                          <Link to={`/plans/${plan.id}`}>
                            <Button variant="outline" size="sm">
                              Abrir
                            </Button>
                          </Link>
                        </div>
                      </div>

                      {plan.macrocycles?.length > 0 && (
                        <div className="mt-3 rounded-md border border-gray-100 px-3">
                          <Accordion type="single" collapsible>
                            {plan.macrocycles.map((macro, index) => (
                              <AccordionItem key={macro.id} value={macro.id}>
                                <AccordionTrigger>
                                  Macro Bloco {index + 1}: {macro.name}
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-1 text-xs text-muted-foreground">
                                    <p>Fase: {planService.translatePhase(macro.phase)}</p>
                                    <p>Semanas: {macro.weekStart} - {macro.weekEnd}</p>
                                    <p>Mesociclos: {macro.mesocycles?.length ?? 0}</p>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>{alunoDetailsCopy.assessmentsTitle}</CardTitle>
              <CardDescription>{alunoDetailsCopy.assessmentsDescription}</CardDescription>
            </div>
            {user?.type === 'professor' && (
              <Button type="button" variant="outline" size="sm" onClick={handleStartAssessmentGuide}>
                <Sparkles className="h-4 w-4" />
                {alunoDetailsCopy.assessmentGuideReopen}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {showAssessmentGuideBanner && (
            <div className="rounded-2xl border border-info/20 bg-info/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 text-info" />
                    {alunoDetailsCopy.assessmentGuideBannerTitle}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {alunoDetailsCopy.assessmentGuideBannerDescription}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={handleStartAssessmentGuide}>
                    {alunoDetailsCopy.assessmentGuideStart}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAssessmentGuideBanner(false)}
                  >
                    {alunoDetailsCopy.assessmentGuideLater}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleHideAssessmentGuidePermanently}
                  >
                    {alunoDetailsCopy.assessmentGuideHide}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div
            ref={assessmentSummaryRef}
            className={`grid gap-4 md:grid-cols-3 rounded-2xl transition-all ${
              isAssessmentGuideStep(0)
                ? 'border border-info/40 bg-info/5 p-3 shadow-[0_0_0_1px_rgba(14,165,233,0.12)]'
                : ''
            }`}
          >
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

          <div
            ref={newAssessmentRef}
            className={`rounded-lg border p-4 transition-colors ${
              assessmentGuideActive
                ? 'border-info bg-info/5 shadow-[0_0_0_1px_rgba(14,165,233,0.15)]'
                : 'border-gray-200'
            }`}
          >
            <h3 className="text-sm font-semibold text-gray-900">Nova Avaliação</h3>
            {assessmentGuideActive && (
              <div className="mt-3 rounded-xl border border-info/20 bg-background p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">
                      {alunoDetailsCopy.assessmentGuidePanelTitle}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {alunoDetailsCopy.assessmentGuideProgressLabel} {assessmentGuideStep + 1} de{' '}
                      {assessmentGuideSteps.length}
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {assessmentGuideCurrentStep?.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {assessmentGuideCurrentStep?.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {alunoDetailsCopy.assessmentGuidePanelHint}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handlePreviousAssessmentGuideStep}
                      disabled={assessmentGuideStep === 0}
                    >
                      {alunoDetailsCopy.assessmentGuidePrevious}
                    </Button>
                    {assessmentGuideStep === assessmentGuideSteps.length - 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setAssessmentGuideActive(false)}
                      >
                        {alunoDetailsCopy.assessmentGuideFinish}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleNextAssessmentGuideStep}
                      >
                        {alunoDetailsCopy.assessmentGuideNext}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAssessmentGuideActive(false)}
                    >
                      {alunoDetailsCopy.assessmentGuideClose}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_0.8fr_1fr_auto]">
              <div
                ref={assessmentTypeFieldRef}
                className={`rounded-xl transition-all ${
                  isAssessmentGuideStep(1)
                    ? 'bg-info/5 p-2 shadow-[0_0_0_1px_rgba(14,165,233,0.18)]'
                    : ''
                }`}
              >
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
              </div>
              <div
                ref={assessmentDateFieldRef}
                className={`rounded-xl transition-all ${
                  isAssessmentGuideStep(2)
                    ? 'bg-info/5 p-2 shadow-[0_0_0_1px_rgba(14,165,233,0.18)]'
                    : ''
                }`}
              >
                <input
                  type="date"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={assessmentForm.assessmentDate}
                  onChange={(event) =>
                    setAssessmentForm({ ...assessmentForm, assessmentDate: event.target.value })
                  }
                />
              </div>
              <div
                ref={assessmentFileFieldRef}
                className={`rounded-xl transition-all ${
                  isAssessmentGuideStep(3)
                    ? 'bg-info/5 p-2 shadow-[0_0_0_1px_rgba(14,165,233,0.18)]'
                    : ''
                }`}
              >
                <input
                  type="file"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(event) =>
                    setAssessmentForm({
                      ...assessmentForm,
                      file: event.target.files?.[0] || null,
                    })
                  }
                />
              </div>
              <div
                ref={assessmentSubmitRef}
                className={`rounded-xl transition-all ${
                  isAssessmentGuideStep(4)
                    ? 'bg-info/5 p-2 shadow-[0_0_0_1px_rgba(14,165,233,0.18)]'
                    : ''
                }`}
              >
                <Button
                  type="button"
                  onClick={handleAssessmentUpload}
                  isLoading={uploadingAssessment}
                  className="w-full"
                >
                  Enviar
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {alunoDetailsCopy.assessmentSubmissionChecklistTitle}
                </p>
                <p className="text-sm text-muted-foreground">
                  {assessmentSubmissionPendingCount === 0
                    ? alunoDetailsCopy.assessmentSubmissionChecklistReady
                    : `${assessmentSubmissionPendingCount} ${assessmentSubmissionPendingCount === 1 ? alunoDetailsCopy.assessmentSubmissionChecklistPendingSingular : alunoDetailsCopy.assessmentSubmissionChecklistPendingPlural}`}
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {assessmentSubmissionChecklist.map((item) => (
                  <div
                    key={item.key}
                    className={`rounded-xl border p-4 ${
                      item.complete
                        ? 'border-emerald-200 bg-background'
                        : 'border-amber-200 bg-background'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          item.complete
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.complete ? 'OK' : '!'}
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                {alunoDetailsCopy.assessmentSubmissionChecklistHint}
              </p>
            </div>

            {selectedAssessmentType && assessmentProtocolGuidance && (
              <div className="mt-4 rounded-2xl border border-info/20 bg-slate-50/80 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <span className="inline-flex items-center rounded-full bg-info/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-info">
                      {assessmentProtocolGuidance.badge}
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {alunoDetailsCopy.assessmentProtocolPanelTitle}
                      </p>
                      <p className="text-base font-semibold text-gray-900">
                        {selectedAssessmentType.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedAssessmentType.description?.trim() ||
                          alunoDetailsCopy.assessmentProtocolPanelDescriptionFallback}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setAssessmentProtocolPanelExpanded((currentValue) => !currentValue)
                    }
                  >
                    {assessmentProtocolPanelExpanded
                      ? alunoDetailsCopy.assessmentProtocolPanelCollapse
                      : alunoDetailsCopy.assessmentProtocolPanelExpand}
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {alunoDetailsCopy.assessmentProtocolPanelCadenceLabel}
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {assessmentProtocolCadence ||
                        alunoDetailsCopy.assessmentProtocolPanelNotAvailable}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {alunoDetailsCopy.assessmentProtocolPanelLastRecorded}
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selectedAssessmentTypeSummary?.lastAssessmentDate
                        ? formatDateBR(selectedAssessmentTypeSummary.lastAssessmentDate)
                        : alunoDetailsCopy.assessmentProtocolPanelNotAvailable}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {alunoDetailsCopy.assessmentProtocolPanelNextDue}
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selectedAssessmentTypeSummary?.nextDueDate
                        ? formatDateBR(selectedAssessmentTypeSummary.nextDueDate)
                        : alunoDetailsCopy.assessmentProtocolPanelNotAvailable}
                    </p>
                  </div>
                </div>

                {assessmentProtocolPanelExpanded && (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border bg-background p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {alunoDetailsCopy.assessmentProtocolPanelWhenToUse}
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {assessmentProtocolGuidance.whenToUse}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-background p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {alunoDetailsCopy.assessmentProtocolPanelRequired}
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {assessmentProtocolGuidance.required}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-background p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {alunoDetailsCopy.assessmentProtocolPanelCommonError}
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {assessmentProtocolGuidance.commonError}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-background p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {alunoDetailsCopy.assessmentProtocolPanelTrainingRelation}
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {assessmentProtocolGuidance.trainingRelation}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-info/20 bg-info/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-info">
                        {alunoDetailsCopy.assessmentProtocolPanelMethodHint}
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {assessmentProtocolGuidance.methodHint}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            <ProfessorManualContextPanel
              title="Manual do Professor para este momento"
              description="Trechos curtos do manual que ajudam no envio, na leitura do historico e na conexao da avaliacao com o treino."
              contexts={['avaliacao_fisica']}
              limit={5}
              className="mt-4"
            />

            {assessmentUploadFeedback && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">
                      {alunoDetailsCopy.assessmentNextStepTitle}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {assessmentUploadFeedback.assessmentDate
                        ? `${alunoDetailsCopy.assessmentNextStepDescriptionWithDatePrefix} ${assessmentUploadFeedback.typeName} ${alunoDetailsCopy.assessmentNextStepDescriptionWithDateMiddle} ${formatDateBR(assessmentUploadFeedback.assessmentDate)}.`
                        : `${alunoDetailsCopy.assessmentNextStepDescriptionWithoutDatePrefix} ${assessmentUploadFeedback.typeName}.`}
                    </p>
                    <p className="text-sm text-foreground">
                      {assessmentUploadFeedback.hasTrainingPlan
                        ? alunoDetailsCopy.assessmentNextStepTrainingPlanReady
                        : alunoDetailsCopy.assessmentNextStepTrainingPlanMissing}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActiveTab('history');
                        window.requestAnimationFrame(() => {
                          assessmentSummaryRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          });
                        });
                      }}
                    >
                      {alunoDetailsCopy.assessmentNextStepHistoryCta}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => navigate('/plans')}
                    >
                      {alunoDetailsCopy.assessmentNextStepPlansCta}
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
                  className="rounded-lg border border-destructive/20 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
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
              <div className="space-y-4">
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
                <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-[70vh] overflow-y-auto">
                  <table className="min-w-full text-sm table-fixed">
                    <colgroup>
                      <col className={historyVariableColumnWidthClass} />
                      {sortedAssessments.map((assessment) => (
                        <Fragment key={assessment.id}>
                          <col className="w-24" />
                          <col className="w-24" />
                        </Fragment>
                      ))}
                      <col className="w-24" />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted text-center text-xs uppercase text-gray-500">
                        <th className={`px-3 py-2 ${historyVariableColumnWidthClass} text-left`}>
                          Variável
                        </th>
                        {sortedAssessments.map((assessment) => (
                          <th
                            key={assessment.id}
                            className="px-3 py-2 text-center border-l border-gray-200/60"
                            colSpan={2}
                          >
                            {new Date(assessment.assessmentDate).toLocaleDateString()}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-center w-24 border-l border-gray-200/60">
                          Δ% Total
                        </th>
                      </tr>
                      <tr className="border-b text-center text-xs uppercase text-gray-400 bg-muted">
                        <th className="px-3 py-2 text-left"></th>
                        {sortedAssessments.map((assessment) => (
                          <Fragment key={assessment.id}>
                            <th className="px-3 py-2 border-l border-gray-200/60">Valor</th>
                            <th className="px-3 py-2">Δ%</th>
                          </Fragment>
                        ))}
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistorySections.map((section) => (
                        <Fragment key={`${section.title}-${section.subtitle || 'main'}`}>
                          <tr className="bg-gray-50">
                            <td colSpan={historyColumnCount} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-gray-900">
                                  {section.title}
                                </div>
                                {section.subtitle && (
                                  <div className="text-xs text-muted-foreground">
                                    • {section.subtitle}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openHistoryEdit(section.title)}
                                  className="ml-auto rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  Editar dados
                                </button>
                              </div>
                            </td>
                          </tr>
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
                              <tr key={variable} className="border-b text-center">
                                <td
                                  className={`px-3 py-2 font-medium text-gray-700 whitespace-nowrap ${historyVariableColumnWidthClass} text-left`}
                                >
                                  {formatHistoryVariableLabel(variable)}
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
                                      <td className="px-3 py-2 text-center border-l border-gray-200/60">
                                        {value === null || value === undefined
                                          ? '—'
                                          : typeof value === 'string'
                                            ? value
                                            : formatValue(value)}
                                      </td>
                                      <td className="px-3 py-2 text-xs text-muted-foreground text-center">
                                        {delta === null || !Number.isFinite(delta)
                                          ? '—'
                                          : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                                      </td>
                                    </Fragment>
                                  );
                                })}
                                <td className="px-3 py-2 text-xs text-muted-foreground text-center w-24 border-l border-gray-200/60">
                                  {totalDelta === null || !Number.isFinite(totalDelta)
                                    ? '—'
                                    : `${totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(1)}%`}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                <table className="min-w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-muted text-center text-xs uppercase text-gray-500">
                      <th className={`px-3 py-2 ${historyVariableColumnWidthClass} text-left`}>Variável</th>
                      <th className="px-3 py-2 w-40">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyEditSectionVariables.map((variable) => (
                      <tr key={variable} className="border-b text-center">
                        <td
                          className={`px-3 py-2 text-gray-700 ${historyVariableColumnWidthClass} text-left`}
                        >
                          {formatHistoryVariableLabel(variable)}
                        </td>
                        <td className="px-3 py-2 w-40">
                          <input
                            type="text"
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-center"
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
                          {log.professor?.user?.profile?.name || 'Professor'} •{' '}
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
                ? 'bg-success text-white'
                : 'bg-destructive text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}







