import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  contractRecordRepository,
  type ContractDbClient,
} from './contract-record.repository.js';

const prisma = new PrismaClient();

type Actor = {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
};

const hashDocument = (html: string) =>
  crypto.createHash('sha256').update(html).digest('hex');

export const contractPdfService = {
  async generate(
    companyContractId: string,
    contractId: string,
    actor: Actor = {},
    client: ContractDbClient = prisma
  ) {
    const contract = await contractRecordRepository.findByIdForCompany(
      contractId,
      companyContractId,
      client
    );
    if (!contract) throw new Error('Contrato não encontrado');
    if (contract.status === 'DRAFT') {
      throw new Error('Contrato em rascunho não pode gerar PDF');
    }
    if (contract.status === 'CANCELLED') {
      throw new Error('Contrato cancelado não pode gerar PDF');
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(contract.renderedHtml, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      });

      const dir = path.join(process.cwd(), 'storage', 'contracts');
      await fs.mkdir(dir, { recursive: true });
      const pdfPath = path.join(dir, `${contract.id}.pdf`);
      await fs.writeFile(pdfPath, pdfBuffer);
      const documentHash = hashDocument(contract.renderedHtml);

      await client.contract.updateMany({
        where: { id: contract.id, companyContractId },
        data: { pdfPath, documentHash },
      });
      await client.contractAuditLog.create({
        data: {
          contractId: contract.id,
          actorUserId: actor.userId,
          action: 'GENERATED_PDF' as never,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          details: { pdfPath, partyType: contract.partyType } as Prisma.InputJsonObject,
        },
      });

      return contractRecordRepository.findByIdForCompany(
        contract.id,
        companyContractId,
        client
      );
    } finally {
      await browser.close();
    }
  },
};
