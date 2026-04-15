import { fetch, type RequestInit, type Response } from 'undici';

type JiraCredentials = {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
};

type JiraIssuePayload = {
  summary: string;
  description?: string;
  issueType: string;
  priorityName?: string;
  labels?: string[];
  assigneeAccountId?: string;
};

type JiraRequestError = Error & {
  statusCode?: number;
  details?: unknown;
};

function getJiraCredentials(): JiraCredentials {
  const baseUrl = process.env.JIRA_BASE_URL?.trim();
  const email = process.env.JIRA_USER_EMAIL?.trim();
  const apiToken = process.env.JIRA_API_TOKEN?.trim();
  const projectKey = process.env.JIRA_PROJECT_KEY?.trim() || 'SDT';

  if (!baseUrl || !email || !apiToken) {
    const error = new Error(
      'Integracao Jira nao configurada. Defina JIRA_BASE_URL, JIRA_USER_EMAIL e JIRA_API_TOKEN.'
    ) as JiraRequestError;
    error.statusCode = 500;
    throw error;
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    email,
    apiToken,
    projectKey,
  };
}

function getAuthHeader(credentials: JiraCredentials): string {
  const token = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
  return `Basic ${token}`;
}

async function parseJsonSafely(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function jiraRequest<T>(
  path: string,
  init?: RequestInit,
  credentials?: JiraCredentials
): Promise<T> {
  const config = credentials ?? getJiraCredentials();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: getAuthHeader(config),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const body = await parseJsonSafely(response);

  if (!response.ok) {
    const error = new Error(
      (body as any)?.errorMessages?.[0] ||
        (body as any)?.message ||
        `Falha ao comunicar com Jira (${response.status})`
    ) as JiraRequestError;
    error.statusCode = response.status;
    error.details = body;
    throw error;
  }

  return body as T;
}

function buildAdfDescription(description?: string) {
  const content = (description || '').trim();

  return {
    type: 'doc',
    version: 1,
    content: content
      ? content.split(/\r?\n\r?\n/).map((paragraph) => ({
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: paragraph.replace(/\r?\n/g, '\n'),
            },
          ],
        }))
      : [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Issue criada pelo sistema_acesso.',
              },
            ],
          },
        ],
  };
}

export const jiraService = {
  getConfiguredProjectKey() {
    return process.env.JIRA_PROJECT_KEY?.trim() || 'SDT';
  },

  async getStatus() {
    const credentials = getJiraCredentials();
    const me = await jiraRequest<{
      accountId: string;
      displayName: string;
      emailAddress?: string;
    }>('/rest/api/3/myself', undefined, credentials);

    const project = await jiraRequest<{
      id: string;
      key: string;
      name: string;
      projectTypeKey?: string;
    }>(`/rest/api/3/project/${credentials.projectKey}`, undefined, credentials);

    return {
      connected: true,
      baseUrl: credentials.baseUrl,
      project,
      authenticatedUser: {
        accountId: me.accountId,
        displayName: me.displayName,
        emailAddress: me.emailAddress,
      },
    };
  },

  async getProjectMetadata(projectKey?: string) {
    const credentials = getJiraCredentials();
    const resolvedProjectKey = projectKey?.trim() || credentials.projectKey;

    const project = await jiraRequest<{
      id: string;
      key: string;
      name: string;
      projectTypeKey?: string;
    }>(`/rest/api/3/project/${resolvedProjectKey}`, undefined, credentials);

    const [issueTypes, priorities] = await Promise.all([
      jiraRequest<Array<{ id: string; name: string; description?: string }>>(
        `/rest/api/3/issuetype/project?projectId=${encodeURIComponent(project.id)}`,
        undefined,
        credentials
      ).catch(async () =>
        jiraRequest<Array<{ id: string; name: string; description?: string }>>(
          '/rest/api/3/issuetype',
          undefined,
          credentials
        )
      ),
      jiraRequest<Array<{ id: string; name: string }>>('/rest/api/3/priority', undefined, credentials),
    ]);

    return {
      project,
      issueTypes,
      priorities,
    };
  },

  async getIssue(issueKey: string) {
    const credentials = getJiraCredentials();
    return jiraRequest<{
      id: string;
      key: string;
      self: string;
      fields: Record<string, unknown>;
    }>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,issuetype,priority,assignee,reporter,created,updated`,
      undefined,
      credentials
    );
  },

  async createIssue(payload: JiraIssuePayload & { projectKey?: string }) {
    const credentials = getJiraCredentials();
    const resolvedProjectKey = payload.projectKey?.trim() || credentials.projectKey;

    const body = {
      fields: {
        project: {
          key: resolvedProjectKey,
        },
        summary: payload.summary.trim(),
        issuetype: {
          name: payload.issueType,
        },
        description: buildAdfDescription(payload.description),
        ...(payload.priorityName
          ? {
              priority: {
                name: payload.priorityName,
              },
            }
          : {}),
        ...(payload.labels?.length ? { labels: payload.labels } : {}),
        ...(payload.assigneeAccountId
          ? {
              assignee: {
                accountId: payload.assigneeAccountId,
              },
            }
          : {}),
      },
    };

    const created = await jiraRequest<{ id: string; key: string; self: string }>(
      '/rest/api/3/issue',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      credentials
    );

    return {
      ...created,
      browseUrl: `${credentials.baseUrl}/browse/${created.key}`,
      projectKey: resolvedProjectKey,
    };
  },
};
