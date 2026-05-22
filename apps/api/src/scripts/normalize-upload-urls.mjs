#!/usr/bin/env node

import '../bootstrap-env.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

function normalizeUploadsPath(path) {
  return path
    .replace(/^\/?api\/v\d+\//i, '/')
    .replace(/^\/?uploads\//i, '/uploads/');
}

function extractUploadsPath(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const match = url.match(/\/?(?:api\/v\d+\/)?uploads\/.+/i);
  return match ? normalizeUploadsPath(match[0]) : null;
}

function normalizeUploadUrl(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  const trimmed = url.trim();

  if (/^(data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const uploadsPath = extractUploadsPath(trimmed);
    if (uploadsPath) {
      return uploadsPath;
    }
    return trimmed;
  }

  if (/^\/?(?:api\/v\d+\/)?uploads\//i.test(trimmed)) {
    return normalizeUploadsPath(trimmed);
  }

  return trimmed;
}

async function normalizeCompanyContractLogos() {
  console.log('Normalizando CompanyContract.logoUrl...');

  const contracts = await prisma.companyContract.findMany({
    where: {
      logoUrl: {
        not: null,
      },
    },
    select: {
      id: true,
      logoUrl: true,
    },
  });

  let updated = 0;
  for (const contract of contracts) {
    const normalized = normalizeUploadUrl(contract.logoUrl);
    if (normalized !== contract.logoUrl) {
      if (!dryRun) {
        await prisma.companyContract.update({
          where: { id: contract.id },
          data: { logoUrl: normalized },
        });
      }
      console.log(`  ${dryRun ? '[dry-run] ' : '✓ '}${contract.id}: ${contract.logoUrl} → ${normalized}`);
      updated++;
    }
  }

  console.log(`Atualizados ${updated}/${contracts.length} registros de CompanyContract.logoUrl${dryRun ? ' (simulado)' : ''}\n`);
  return updated;
}

async function normalizeProfileAvatars() {
  console.log('Normalizando Profile.avatar...');

  const profiles = await prisma.profile.findMany({
    where: {
      avatar: {
        not: null,
      },
    },
    select: {
      id: true,
      avatar: true,
    },
  });

  let updated = 0;
  for (const profile of profiles) {
    const normalized = normalizeUploadUrl(profile.avatar);
    if (normalized !== profile.avatar) {
      if (!dryRun) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: { avatar: normalized },
        });
      }
      console.log(`  ${dryRun ? '[dry-run] ' : '✓ '}${profile.id}: ${profile.avatar} → ${normalized}`);
      updated++;
    }
  }

  console.log(`Atualizados ${updated}/${profiles.length} registros de Profile.avatar${dryRun ? ' (simulado)' : ''}\n`);
  return updated;
}

async function main() {
  try {
    console.log(`🔄 Iniciando normalização de URLs de upload${dryRun ? ' em modo dry-run' : ''}...\n`);

    const contractsUpdated = await normalizeCompanyContractLogos();
    const profilesUpdated = await normalizeProfileAvatars();

    console.log(`✅ Normalização ${dryRun ? 'simulada' : 'concluída'}!`);
    console.log(`   Total ${dryRun ? 'que seria atualizado' : 'atualizado'}: ${contractsUpdated + profilesUpdated} registros\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro durante normalização:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
