import { PrismaClient, type Prisma } from '@prisma/client';
import Handlebars from 'handlebars';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';

const prisma = new PrismaClient();

export const contractVariables = [
  'aluno.nome',
  'aluno.cpf',
  'aluno.rg',
  'aluno.enderecoCompleto',
  'responsavel.nome',
  'responsavel.cpf',
  'responsavel.email',
  'empresa.razaoSocial',
  'empresa.cnpj',
  'empresa.cref',
  'empresa.endereco',
  'servico.nome',
  'servico.valor',
  'servico.duracaoSessao',
  'servico.quantidadeSemanal',
  'contrato.valorMensal',
  'contrato.valorMensalExtenso',
  'contrato.diaVencimento',
  'contrato.horarios',
  'contrato.dataInicio',
  'contrato.dataAssinatura',
];

type Actor = {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type GenerateContractInput = {
  templateId: string;
  alunoId: string;
  responsavel?: {
    nome?: string;
    cpf?: string;
    email?: string;
  };
  serviceId?: string;
  professorId?: string;
  valorMensal?: number;
  diaVencimento?: number;
  horarios?: string;
  dataInicio?: string | Date;
  dataAssinatura?: string | Date;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function normalizeDocument(value?: string | null) {
  return value?.replace(/\D/g, '') || '';
}

function formatDate(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

function formatAddress(profile?: {
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZipCode?: string | null;
} | null) {
  return [
    [profile?.addressStreet, profile?.addressNumber].filter(Boolean).join(', '),
    profile?.addressComplement,
    profile?.addressNeighborhood,
    [profile?.addressCity, profile?.addressState].filter(Boolean).join(' - '),
    profile?.addressZipCode,
  ]
    .filter(Boolean)
    .join(', ');
}

function amountToWords(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  return `${currency.format(value)} reais`;
}

function documentHash(html: string) {
  return crypto.createHash('sha256').update(html).digest('hex');
}

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildHtmlDocument(input: {
  title: string;
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${input.title}</title>
  <style>
    body { color: #111827; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.55; margin: 40px; }
    h1, h2, h3 { color: #111827; line-height: 1.2; }
    h1 { font-size: 22px; text-align: center; }
    h2 { font-size: 16px; margin-top: 22px; }
    .contract-header, .contract-footer { color: #374151; font-size: 12px; }
    .contract-clause { break-inside: avoid; margin: 18px 0; }
    .signatures { margin-top: 48px; }
  </style>
</head>
<body>
  <header class="contract-header">${input.headerHtml}</header>
  <main>${input.bodyHtml}</main>
  <footer class="contract-footer">${input.footerHtml}</footer>
</body>
</html>`;
}

async function audit(contractId: string, action: string, actor?: Actor, details?: Prisma.InputJsonValue) {
  await prisma.contractAuditLog.create({
    data: {
      contractId,
      actorUserId: actor?.userId,
      action: action as never,
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
      details,
    },
  });
}

export const contractDocumentService = {
  listVariables() {
    return contractVariables.map((key) => ({
      key,
      token: `{{${key}}}`,
    }));
  },

  async listTemplates(contractId: string) {
    return prisma.contractTemplate.findMany({
      where: { contractId },
      include: { service: true, clauses: { orderBy: { order: 'asc' } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  },

  async createTemplate(contractId: string, data: any, actor?: Actor) {
    const template = await prisma.contractTemplate.create({
      data: {
        contractId,
        name: String(data.name || '').trim(),
        description: data.description || null,
        serviceId: data.serviceId || null,
        version: Number(data.version || 1),
        status: data.status || 'DRAFT',
        headerHtml: data.headerHtml || '',
        footerHtml: data.footerHtml || '',
        clauses: {
          create: (data.clauses || []).map((clause: any, index: number) => ({
            order: Number(clause.order ?? index + 1),
            title: clause.title || `Cláusula ${index + 1}`,
            bodyHtml: clause.bodyHtml || '',
            required: clause.required ?? true,
            editable: clause.editable ?? true,
          })),
        },
      },
      include: { clauses: { orderBy: { order: 'asc' } } },
    });
    return template;
  },

  async updateTemplate(contractId: string, templateId: string, data: any) {
    return prisma.contractTemplate.update({
      where: { id: templateId, contractId },
      data: {
        name: data.name,
        description: data.description,
        serviceId: data.serviceId ?? undefined,
        version: data.version,
        status: data.status,
        headerHtml: data.headerHtml,
        footerHtml: data.footerHtml,
      },
      include: { clauses: { orderBy: { order: 'asc' } } },
    });
  },

  async duplicateTemplate(contractId: string, templateId: string) {
    const source = await prisma.contractTemplate.findUniqueOrThrow({
      where: { id: templateId, contractId },
      include: { clauses: { orderBy: { order: 'asc' } } },
    });
    return this.createTemplate(contractId, {
      name: `${source.name} (cópia)`,
      description: source.description,
      serviceId: source.serviceId,
      version: source.version + 1,
      status: 'DRAFT',
      headerHtml: source.headerHtml,
      footerHtml: source.footerHtml,
      clauses: source.clauses,
    });
  },

  async setTemplateStatus(contractId: string, templateId: string, status: 'DRAFT' | 'ACTIVE' | 'INACTIVE') {
    return prisma.contractTemplate.update({
      where: { id: templateId, contractId },
      data: { status },
    });
  },

  async listClauses(contractId: string, templateId: string) {
    await prisma.contractTemplate.findUniqueOrThrow({ where: { id: templateId, contractId } });
    return prisma.contractTemplateClause.findMany({
      where: { templateId },
      orderBy: { order: 'asc' },
    });
  },

  async createClause(contractId: string, templateId: string, data: any) {
    await prisma.contractTemplate.findUniqueOrThrow({ where: { id: templateId, contractId } });
    const count = await prisma.contractTemplateClause.count({ where: { templateId } });
    return prisma.contractTemplateClause.create({
      data: {
        templateId,
        order: Number(data.order ?? count + 1),
        title: data.title || `Cláusula ${count + 1}`,
        bodyHtml: data.bodyHtml || '',
        required: data.required ?? true,
        editable: data.editable ?? true,
      },
    });
  },

  async updateClause(contractId: string, templateId: string, clauseId: string, data: any) {
    await prisma.contractTemplate.findUniqueOrThrow({ where: { id: templateId, contractId } });
    return prisma.contractTemplateClause.update({
      where: { id: clauseId, templateId },
      data: {
        order: data.order,
        title: data.title,
        bodyHtml: data.bodyHtml,
        required: data.required,
        editable: data.editable,
      },
    });
  },

  async removeClause(contractId: string, templateId: string, clauseId: string) {
    await prisma.contractTemplate.findUniqueOrThrow({ where: { id: templateId, contractId } });
    return prisma.contractTemplateClause.delete({ where: { id: clauseId, templateId } });
  },

  async reorderClauses(contractId: string, templateId: string, clauseIds: string[]) {
    await prisma.contractTemplate.findUniqueOrThrow({ where: { id: templateId, contractId } });
    await prisma.$transaction(
      clauseIds.map((id, index) =>
        prisma.contractTemplateClause.update({
          where: { id, templateId },
          data: { order: index + 1 },
        })
      )
    );
    return this.listClauses(contractId, templateId);
  },

  async buildContext(contractId: string, input: GenerateContractInput) {
    const [company, aluno, service, professor] = await Promise.all([
      prisma.companyContract.findUniqueOrThrow({ where: { id: contractId } }),
      prisma.aluno.findUniqueOrThrow({
        where: { id: input.alunoId },
        include: { user: { include: { profile: true } }, service: true },
      }),
      input.serviceId ? prisma.serviceOption.findUnique({ where: { id: input.serviceId } }) : null,
      input.professorId
        ? prisma.professor.findUnique({
            where: { id: input.professorId },
            include: { user: { include: { profile: true } } },
          })
        : null,
    ]);

    const selectedService = service || aluno.service;
    const valorMensal =
      input.valorMensal ?? (selectedService?.monthlyPrice ? Number(selectedService.monthlyPrice) : undefined);

    return {
      aluno: {
        nome: aluno.user.profile?.name || '',
        cpf: normalizeDocument(aluno.user.profile?.cpf),
        rg: aluno.user.profile?.rg || '',
        enderecoCompleto: formatAddress(aluno.user.profile),
      },
      responsavel: {
        nome: input.responsavel?.nome || aluno.user.profile?.name || '',
        cpf: normalizeDocument(input.responsavel?.cpf || aluno.user.profile?.cpf),
        email: input.responsavel?.email || aluno.user.email,
      },
      empresa: {
        razaoSocial: company.name || '',
        cnpj: normalizeDocument(company.document),
        cref: company.cref || '',
        endereco: formatAddress(company),
      },
      servico: {
        nome: selectedService?.name || '',
        valor: valorMensal ? currency.format(valorMensal) : '',
        duracaoSessao: '',
        quantidadeSemanal: '',
      },
      professor: {
        nome: professor?.user.profile?.name || '',
      },
      contrato: {
        valorMensal: valorMensal ? currency.format(valorMensal) : '',
        valorMensalExtenso: amountToWords(valorMensal),
        diaVencimento: input.diaVencimento || '',
        horarios: input.horarios || '',
        dataInicio: formatDate(input.dataInicio),
        dataAssinatura: formatDate(input.dataAssinatura || new Date()),
      },
    };
  },

  renderTemplate(template: { headerHtml: string; footerHtml: string; clauses: any[]; name: string }, context: any) {
    const render = (html: string) => Handlebars.compile(html, { noEscape: false })(context);
    const bodyHtml = [
      `<h1>${template.name}</h1>`,
      ...template.clauses
        .sort((a, b) => a.order - b.order)
        .map(
          (clause) =>
            `<section class="contract-clause"><h2>${clause.title}</h2>${render(clause.bodyHtml)}</section>`
        ),
      '<section class="signatures"><p>________________________________________</p><p>Contratante</p><p>________________________________________</p><p>Contratada</p></section>',
    ].join('\n');
    return buildHtmlDocument({
      title: template.name,
      headerHtml: render(template.headerHtml),
      footerHtml: render(template.footerHtml),
      bodyHtml,
    });
  },

  async preview(contractId: string, input: GenerateContractInput) {
    const template = await prisma.contractTemplate.findUniqueOrThrow({
      where: { id: input.templateId, contractId },
      include: { clauses: { orderBy: { order: 'asc' } } },
    });
    const context = await this.buildContext(contractId, input);
    return {
      html: this.renderTemplate(template, context),
      context,
    };
  },

  async generate(contractId: string, input: GenerateContractInput, actor?: Actor) {
    const template = await prisma.contractTemplate.findUniqueOrThrow({
      where: { id: input.templateId, contractId },
      include: { clauses: { orderBy: { order: 'asc' } } },
    });
    if (template.status !== 'ACTIVE') {
      throw new Error('Modelo precisa estar ativo para gerar contrato');
    }

    const context = await this.buildContext(contractId, input);
    const renderedHtml = this.renderTemplate(template, context);
    const created = await prisma.contract.create({
      data: {
        companyContractId: contractId,
        templateId: template.id,
        templateVersion: template.version,
        alunoId: input.alunoId,
        responsavelName: input.responsavel?.nome || null,
        responsavelCpf: input.responsavel?.cpf || null,
        responsavelEmail: input.responsavel?.email || null,
        serviceId: input.serviceId || null,
        professorId: input.professorId || null,
        status: 'GENERATED',
        title: template.name,
        renderedHtml,
        dataSnapshot: context as Prisma.InputJsonObject,
        documentHash: documentHash(renderedHtml),
      },
    });
    await audit(created.id, 'GENERATED', actor, { templateId: template.id });
    return created;
  },

  async listByAluno(contractId: string, alunoId: string) {
    return prisma.contract.findMany({
      where: { companyContractId: contractId, alunoId },
      include: { template: true, signatures: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getForContract(contractId: string, contractDocumentId: string) {
    return prisma.contract.findUniqueOrThrow({
      where: { id: contractDocumentId, companyContractId: contractId },
      include: { aluno: { include: { user: { include: { profile: true } } } }, signatures: true },
    });
  },

  async generatePdf(contractId: string, contractDocumentId: string, actor?: Actor) {
    const contract = await this.getForContract(contractId, contractDocumentId);
    const outputDir = path.resolve(process.cwd(), 'uploads', 'contracts', 'generated');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${contract.id}.pdf`);
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(contract.renderedHtml, { waitUntil: 'networkidle0' });
      await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
    } finally {
      await browser.close();
    }
    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: { pdfPath: `/uploads/contracts/generated/${contract.id}.pdf` },
    });
    await audit(contract.id, 'PDF_GENERATED', actor);
    return updated;
  },

  async sendForSignature(contractId: string, contractDocumentId: string, actor?: Actor) {
    const contract = await this.getForContract(contractId, contractDocumentId);
    if (contract.status === 'SIGNED') {
      throw new Error('Contrato assinado não pode ser reenviado');
    }
    const token = crypto.randomBytes(32).toString('hex');
    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: 'SENT',
        publicTokenHash: tokenHash(token),
        publicTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });
    await audit(contract.id, 'SENT', actor);
    return { contract: updated, token };
  },

  async openPublic(token: string, actor?: Actor) {
    const contract = await prisma.contract.findUniqueOrThrow({
      where: { publicTokenHash: tokenHash(token) },
      include: { signatures: true },
    });
    if (contract.publicTokenExpiresAt && contract.publicTokenExpiresAt < new Date()) {
      await prisma.contract.update({ where: { id: contract.id }, data: { status: 'EXPIRED' } });
      throw new Error('Link expirado');
    }
    if (contract.status === 'SENT') {
      await prisma.contract.update({ where: { id: contract.id }, data: { status: 'VIEWED' } });
      await audit(contract.id, 'VIEWED', actor);
    }
    return contract;
  },

  async signPublic(token: string, data: { signerName: string; signerCpf: string; signerEmail?: string }, actor?: Actor) {
    const contract = await this.openPublic(token, actor);
    if (contract.status === 'SIGNED') {
      throw new Error('Contrato já assinado');
    }
    if (contract.status === 'CANCELLED' || contract.status === 'EXPIRED') {
      throw new Error('Contrato não está disponível para assinatura');
    }
    const hash = contract.documentHash || documentHash(contract.renderedHtml);
    const signature = await prisma.$transaction(async (tx) => {
      const created = await tx.contractSignature.create({
        data: {
          contractId: contract.id,
          signerName: data.signerName,
          signerCpf: normalizeDocument(data.signerCpf),
          signerEmail: data.signerEmail || null,
          ipAddress: actor?.ipAddress,
          userAgent: actor?.userAgent,
          documentHash: hash,
        },
      });
      await tx.contract.update({
        where: { id: contract.id },
        data: {
          status: 'SIGNED',
          signedAt: new Date(),
          documentHash: hash,
        },
      });
      return created;
    });
    await audit(contract.id, 'SIGNED', actor, { signatureId: signature.id });
    return signature;
  },

  async cancel(contractId: string, contractDocumentId: string, actor?: Actor) {
    const contract = await this.getForContract(contractId, contractDocumentId);
    if (contract.status === 'SIGNED') {
      throw new Error('Contrato assinado não pode ser cancelado; gere um aditivo ou novo contrato');
    }
    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await audit(contract.id, 'CANCELLED', actor);
    return updated;
  },

  async auditLogs(contractId: string, contractDocumentId: string) {
    await this.getForContract(contractId, contractDocumentId);
    return prisma.contractAuditLog.findMany({
      where: { contractId: contractDocumentId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
