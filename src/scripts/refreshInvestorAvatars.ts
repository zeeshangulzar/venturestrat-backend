import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import fetch from 'node-fetch';
import { uploadPublicFile } from '../services/storage.js';

const prisma = new PrismaClient();

const DEFAULT_S3_PREFIX = 'https://venturestrat-staging.s3.us-east-1.amazonaws.com/investors/';
const IGNORE_PREFIX = process.env.INVESTOR_AVATAR_S3_PREFIX || DEFAULT_S3_PREFIX;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_BUCKET = process.env.AWS_S3_BUCKET_NAME || 'venturestrat-staging';
const INVESTOR_S3_BASE_URL = `https://${AWS_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

type AvatarUpdateRow = {
  id: string;
  name: string;
  oldAvatar: string;
  newAvatar: string;
  status: string;
};

function resolveOutputPath(filename: string) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '../../exports', filename);
}

function getExtensionFromContentType(contentType: string | null): string {
  if (!contentType) return 'jpg';
  const lower = contentType.toLowerCase().split(';')[0].trim();
  return MIME_EXTENSION_MAP[lower] || 'jpg';
}

function guessContentTypeFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.gif')) return 'image/gif';
    if (pathname.endsWith('.webp')) return 'image/webp';
  } catch (error) {
    console.warn('Failed to parse URL for content type guessing:', error);
  }
  return 'image/jpeg';
}

async function fetchAvatarBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      console.warn(`Avatar fetch failed (${response.status}) for ${url}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || guessContentTypeFromUrl(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.length) {
      console.warn(`Avatar fetch returned empty buffer for ${url}`);
      return null;
    }

    return { buffer, contentType };
  } catch (error) {
    console.error(`Error fetching avatar from ${url}:`, error);
    return null;
  }
}

async function processInvestorAvatar(investor: { id: string; name: string; avatar: string | null }): Promise<AvatarUpdateRow | null> {
  const avatar = investor.avatar?.trim();
  if (!avatar) {
    return null;
  }

  if (avatar.startsWith(IGNORE_PREFIX)) {
    return null;
  }

  const fetched = await fetchAvatarBuffer(avatar);
  if (!fetched) {
    return {
      id: investor.id,
      name: investor.name,
      oldAvatar: avatar,
      newAvatar: '',
      status: 'fetch_failed',
    };
  }

  const { buffer, contentType } = fetched;
  const extension = getExtensionFromContentType(contentType);
  const timestamp = Date.now();
  const key = `investors/${investor.id}_${timestamp}.${extension}`;

  try {
    await uploadPublicFile(buffer, key, contentType);
  } catch (error) {
    console.error(`Failed to upload avatar for investor ${investor.id}:`, error);
    return {
      id: investor.id,
      name: investor.name,
      oldAvatar: avatar,
      newAvatar: '',
      status: 'upload_failed',
    };
  }

  const newAvatarUrl = `${INVESTOR_S3_BASE_URL}/${key}`;

  try {
    await prisma.investor.update({
      where: { id: investor.id },
      data: {
        avatar: newAvatarUrl,
      },
    });
  } catch (error) {
    console.error(`Failed to update investor ${investor.id}:`, error);
    return {
      id: investor.id,
      name: investor.name,
      oldAvatar: avatar,
      newAvatar: '',
      status: 'update_failed',
    };
  }

  return {
    id: investor.id,
    name: investor.name,
    oldAvatar: avatar,
    newAvatar: newAvatarUrl,
    status: 'updated',
  };
}

async function writeResultsToWorkbook(rows: AvatarUpdateRow[], outputPath: string) {
  if (!rows.length) {
    console.log('No investors processed; skipping workbook creation.');
    return;
  }

  const worksheetData = [
    ['investor_id', 'name', 'old_avatar', 'new_avatar', 'status'],
    ...rows.map((row) => [row.id, row.name, row.oldAvatar, row.newAvatar, row.status]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 30 },
    { wch: 60 },
    { wch: 60 },
    { wch: 15 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Avatar Updates');

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(workbook, outputPath);
  console.log(`Results written to ${outputPath}`);
}

async function refreshInvestorAvatars() {
  console.log('Starting investor avatar refresh...');

  try {
    const investors = await prisma.investor.findMany({
      select: {
        id: true,
        name: true,
        avatar: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Loaded ${investors.length} investors.`);

    const results: AvatarUpdateRow[] = [];

    for (const investor of investors) {
      const result = await processInvestorAvatar(investor);
      if (result) {
        results.push(result);
        console.log(`Processed investor ${investor.id}: ${result.status}`);
      }
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const outputPath = resolveOutputPath(`investor-avatar-updates_${timestamp}.xlsx`);
    await writeResultsToWorkbook(results, outputPath);

    const updatedCount = results.filter((row) => row.status === 'updated').length;
    console.log(`Completed avatar refresh. Updated ${updatedCount} investors.`);
  } catch (error) {
    console.error('Failed to refresh investor avatars:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

refreshInvestorAvatars();

