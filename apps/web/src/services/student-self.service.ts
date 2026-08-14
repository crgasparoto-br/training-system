import api from './api';

export const STUDENT_PROFILE_REVIEW_ROUTE = '/student/profile-review';
export const STUDENT_HOME_ROUTE = '/inicio';

export type StudentProfileReviewNotificationType =
  | 'profile_review_requested'
  | 'profile_review_reminder'
  | 'profile_review_overdue';

export interface StudentNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
  createdAt: string;
  sentAt?: string | null;
}

export interface StudentSummary {
  name: string;
  nextProfileReviewAt: string | null;
  hasPendingProfileReview: boolean;
  recentNotifications: StudentNotification[];
}

export interface StudentProfileReview {
  id: string;
  alunoId: string;
  requestedAt: string;
  dueAt: string | null;
  status: string;
  sectionsRequested?: unknown;
  requiresApproval?: boolean;
}

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type StudentSelfServiceErrorKind =
  | 'contract-required'
  | 'access-denied'
  | 'not-found'
  | 'error';

const withContractHeader = (contractId?: string) =>
  contractId
    ? {
        headers: {
          'x-contract-id': contractId,
        },
      }
    : undefined;

export function getStudentContractId(search: string): string | undefined {
  const value = new URLSearchParams(search).get('contractId')?.trim();
  return value || undefined;
}

export function withStudentContractContext(path: string, contractId?: string): string {
  if (!contractId) return path;
  const params = new URLSearchParams({ contractId });
  return `${path}?${params.toString()}`;
}

export function getStudentSelfServiceErrorKind(error: unknown): StudentSelfServiceErrorKind {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 409) return 'contract-required';
  if (status === 401 || status === 403) return 'access-denied';
  if (status === 404) return 'not-found';
  return 'error';
}

export const isProfileReviewNotification = (
  notification: StudentNotification
): notification is StudentNotification & { type: StudentProfileReviewNotificationType } =>
  notification.type === 'profile_review_requested' ||
  notification.type === 'profile_review_reminder' ||
  notification.type === 'profile_review_overdue';

export const studentSelfService = {
  async getSummary(contractId?: string): Promise<StudentSummary> {
    const response = await api.get<ApiEnvelope<StudentSummary>>(
      '/student/me/summary',
      withContractHeader(contractId)
    );
    return response.data.data;
  },

  async getNotifications(contractId?: string, limit = 20): Promise<StudentNotification[]> {
    const config = withContractHeader(contractId) ?? {};
    const response = await api.get<ApiEnvelope<StudentNotification[]>>('/student/me/notifications', {
      ...config,
      params: { limit },
    });
    return response.data.data;
  },

  async getProfileReview(contractId?: string): Promise<StudentProfileReview | null> {
    const response = await api.get<ApiEnvelope<StudentProfileReview | null>>(
      '/student/me/profile-review',
      withContractHeader(contractId)
    );
    return response.data.data;
  },
};
