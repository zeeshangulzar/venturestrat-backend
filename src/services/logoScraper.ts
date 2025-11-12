// src/services/logoScraper.ts
import 'dotenv/config';
import { load, type CheerioAPI } from 'cheerio';
import axios from 'axios';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { uploadPublicFile, getSignedUrlForAsset } from './storage.js';

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/scrape';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 20000);
const execFileAsync = promisify(execFile);

export interface LogoScrapingResult {
  success: boolean;
  logoUrl?: string;
  error?: string;
}

type AiLogoSelection = {
  url: string;
  reason?: string;
};

type LogoCandidate = {
  url: string;
  source: string;
};

type RichLogoCandidate = {
  id: string;
  url: string; // absolute or data:
  kind: 'img' | 'svg' | 'bg' | 'icon';
  alt?: string;
  classList?: string[];
  idAttr?: string;
  filename?: string;
  inHeaderOrNav?: boolean;
  insideHomeLink?: boolean;
  widthAttr?: number;
  heightAttr?: number;
  containsWordLogo?: boolean;
  containsBrandHint?: boolean;
  thirdPartyPenalty?: number; // 0..1
  score?: number;
  snippet?: string; // short preview for inline svg
};

const AUTO_PICK_THRESHOLD = 55;
const SMALL_ICON_CUTOFF = 64; // px

const WORDS_LOGO = /(^|[-_/])logo([-._/]|$)/i;
const HEADERISH = /(header|masthead|topbar|navbar|site\-header|branding)/i;
const BRANDISH = /(brand|branding|site\-brand|navbar\-brand)/i;

// ======= PUBLIC ENTRYPOINT =======
export async function scrapeWebsiteLogo(websiteUrl: string): Promise<LogoScrapingResult> {
  try {
    // Ensure URL has protocol
    const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    const baseUrl = new URL(url).origin;

    // Extract domain name for matching (e.g., "boxgroup" from "boxgroup.com")
    const domainName = new URL(url).hostname.replace('www.', '').split('.')[0].toLowerCase();

    if (!FIRECRAWL_API_KEY) {
      return {
        success: false,
        error: 'Firecrawl API key is not configured',
      };
    }

    const firecrawlResponse = await axios.post(
      FIRECRAWL_API_URL,
      {
        url,
        formats: ['html', 'markdown'],
        onlyMainContent: false,
        waitFor: 2000,
        timeout: 30000,
      },
      {
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 35000,
      }
    );

    const html = firecrawlResponse.data?.data?.html || firecrawlResponse.data?.html;
    if (!html) {
      return { success: false, error: 'Firecrawl response did not include HTML content' };
    }

    const $ = load(html);

    // Build & score candidates
    const candidates = extractLogoCandidates($, baseUrl, domainName)
      .map((c) => ({ ...c, score: scoreCandidate(c) }))
      .sort((a, b) => (b.score! - a.score!));

    // Legacy fallback (first plausible image/svg in DOM order)
    const legacyFallback = findFallbackLogoCandidate($, baseUrl, domainName);

    // Choose primary candidate: (1) auto-pick high score; else (2) ask OpenAI; else (3) fallback
    let primaryCandidate: LogoCandidate | null = null;

    if (candidates[0] && (candidates[0].score ?? 0) >= AUTO_PICK_THRESHOLD) {
      primaryCandidate = { url: candidates[0].url, source: 'heuristic' };
    } else {
      const aiPick = await pickFromCandidatesWithOpenAI(candidates, baseUrl, domainName);
      if (aiPick?.url) {
        primaryCandidate = { url: aiPick.url, source: aiPick.reason || 'openai' };
      }
    }

    if (!primaryCandidate && legacyFallback) {
      primaryCandidate = legacyFallback;
    }

    if (!primaryCandidate) {
      return { success: false, error: 'No logo candidates found' };
    }

    // Secondary (fallback) candidate if different
    const secondaryCandidate =
      legacyFallback && legacyFallback.url !== primaryCandidate.url ? legacyFallback : null;

    // Download + validate
    const primaryDownload = await downloadLogoCandidate(primaryCandidate);
    let downloadResult = await validateDownloadedLogo(primaryDownload);
    let finalCandidate = primaryCandidate;

    if (!downloadResult.success && secondaryCandidate) {
      const fallbackDownload = await downloadLogoCandidate(secondaryCandidate);
      const validatedFallback = await validateDownloadedLogo(fallbackDownload);
      if (validatedFallback.success) {
        downloadResult = validatedFallback;
        finalCandidate = secondaryCandidate;
      }
    }

    if (!downloadResult.success) {
      return { success: false, error: downloadResult.error };
    }

    const { buffer: rawBuffer, contentType: rawContentType, url: finalLogoUrl, isInlineSvg } =
      downloadResult;
    const normalization = await normalizeLogoBuffer(rawBuffer, rawContentType);
    const logoBuffer = normalization.buffer;
    const contentType = normalization.contentType;

    // Warn if suspiciously large (hero/banner)
    const logoSizeMB = logoBuffer.length / (1024 * 1024);
    if (logoSizeMB > 1) {
      console.log(
        `⚠️  Warning: Logo is very large (${logoSizeMB.toFixed(2)} MB) - might be a hero image, not a logo`
      );
    }

    // Generate filename (for future cloud upload)
    const timestamp = Date.now();
    const extension = (contentType.split('/')[1] || 'png').replace('+xml', '');
    const filename = `logo-${timestamp}.${extension}`;
    const fileKey = `logos/${filename}`;

    // ===== CLOUD UPLOAD (COMMENTED OUT FOR LOCAL TESTING) =====
    await uploadPublicFile(logoBuffer, fileKey, contentType);
    const finalLogoUrlSigned = await getSignedUrlForAsset(fileKey);
    // ===== END CLOUD UPLOAD =====

    console.log('✅ Logo found successfully!');
    console.log('📍 Source:', finalCandidate.source);
    if (normalization.converted) {
      console.log('🔄 Converted logo to PNG for upload/display');
    }
    if (isInlineSvg) {
      console.log('🎨 Type: Inline SVG (embedded in HTML)');
      console.log('🔗 Data URL:', finalLogoUrl.substring(0, 100) + '... (truncated)');
    }
    console.log('🔗 Uploaded file URL:', finalLogoUrlSigned);
    console.log('📦 Content Type:', contentType);
    console.log(
      '📏 Logo Size:',
      `${logoBuffer.length} bytes (${(logoBuffer.length / 1024).toFixed(2)} KB)`
    );
    console.log('💾 Would save as:', fileKey);

    return {
      success: true,
      logoUrl: finalLogoUrlSigned,
    };
  } catch (error) {
    console.error('Error scraping logo:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ======= AI PICKER (CANDIDATE LIST, NOT RAW HTML) =======
async function pickFromCandidatesWithOpenAI(
  candidates: RichLogoCandidate[],
  baseUrl: string,
  domainName?: string
): Promise<AiLogoSelection | null> {
  if (!OPENAI_API_KEY || candidates.length === 0) return null;

  const topK = candidates.slice(0, 8).map((c) => ({
    id: c.id,
    url: c.url,
    kind: c.kind,
    alt: c.alt,
    classList: c.classList,
    idAttr: c.idAttr,
    filename: c.filename,
    inHeaderOrNav: !!c.inHeaderOrNav,
    insideHomeLink: !!c.insideHomeLink,
    widthAttr: c.widthAttr,
    heightAttr: c.heightAttr,
    containsWordLogo: !!c.containsWordLogo,
    containsBrandHint: !!c.containsBrandHint,
    snippet: c.snippet,
    score: c.score,
  }));

  const payload = {
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'logo_choice_v2',
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the chosen candidate' },
            url: { type: 'string', description: 'Absolute URL (or data URI) of chosen candidate' },
            reason: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            noLogo: { type: 'boolean', description: 'True if none is a suitable brand logo' },
          },
          required: ['id', 'url', 'reason', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: 'system',
        content: `You are a brand-logo selector. You receive a small list of image candidates from a website and must pick the company's PRIMARY brand logo.

Rules (very important):
- Prefer SVG over raster when both are plausible.
- Prefer candidates in the header/navigation, especially inside a link to '/'.
- Prefer elements with class/id/filename containing 'logo'.
- Prefer images whose alt/filename includes the brand (${domainName ?? 'brand'}).
- Exclude favicons/small icons (≤64px), social/payment/partner badges, and hero/banner images.
- If multiple variants (dark/light/mark-only), prefer the full horizontal wordmark that best represents the brand.
- Only choose from the provided candidates. If none is appropriate, set "noLogo": true and explain briefly.`,
      },
      {
        role: 'user',
        content: `Origin: ${baseUrl}
Brand hint: ${domainName ?? 'unknown'}

Candidates (ranked by heuristic):
${JSON.stringify(topK, null, 2)}

Return STRICT JSON matching the schema.`,
      },
    ],
  };

  try {
    const res = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      OPENAI_TIMEOUT_MS
    );

    if (!res.ok) {
      const text = await res.text();
      console.warn('OpenAI selection failed:', text);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed =
      typeof content === 'string' ? JSON.parse(content) : JSON.parse(JSON.stringify(content));

    const resolvedUrl = resolveToAbsoluteUrl(String(parsed.url).trim(), baseUrl) || String(parsed.url).trim();
    if (!resolvedUrl) return null;

    return { url: resolvedUrl, reason: parsed.reason || 'openai' };
  } catch (e) {
    console.warn('OpenAI logo picker failed:', e);
    return null;
  }
}

// ======= CANDIDATE EXTRACTION + SCORING =======
function extractLogoCandidates($: CheerioAPI, baseUrl: string, domainName?: string): RichLogoCandidate[] {
  const list: RichLogoCandidate[] = [];

  // helper
  const abs = (u: string) => resolveToAbsoluteUrl(u, baseUrl);

  // 1) <img> & <svg>
  $('img, svg').each((i, el) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase() || '';
    let url = '';

    if (tag === 'svg') {
      const svgHtml = $.html($el);
      if (svgHtml && svgHtml.length > 0 && svgHtml.length < 100_000) {
        url = `data:image/svg+xml;base64,${Buffer.from(svgHtml).toString('base64')}`;
      }
    } else {
      url = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src') || '';
      url = abs(url) || '';
    }
    if (!url) return;

    // DOM context
    const parents = $el
      .parents()
      .toArray()
      .map((p) => {
        const c = ($(p).attr('class') || '') + ' ' + ($(p).attr('id') || '');
        return c;
      })
      .join(' ');
    const inHeaderOrNav = HEADERISH.test(parents) || /(^|\s)(nav|site\-nav)(\s|$)/i.test(parents);
    const classList = ($el.attr('class') || '').split(/\s+/).filter(Boolean);
    const idAttr = $el.attr('id') || undefined;

    // home link?
    const parentLink = $el.closest('a');
    const href = parentLink.attr('href') || '';
    const insideHomeLink = href === '/' || href === baseUrl || href === baseUrl + '/';

    // basic attributes
    const alt = $el.attr('alt') || undefined;
    const widthAttr = Number($el.attr('width') || NaN);
    const heightAttr = Number($el.attr('height') || NaN);

    // filename
    let filename = '';
    try {
      filename = new URL(url.startsWith('data:') ? 'about:blank' : url).pathname.split('/').pop() || '';
    } catch {
      // ignore
    }

    // text hints
    const containsWordLogo =
      WORDS_LOGO.test(filename) ||
      classList.some((c) => WORDS_LOGO.test(c)) ||
      (idAttr ? WORDS_LOGO.test(idAttr) : false);
    const brandNeedle = (domainName || '').replace(/^www\./, '').split('.')[0];
    const containsBrandHint =
      !!brandNeedle &&
      ((alt || '').toLowerCase().includes(brandNeedle) || filename.toLowerCase().includes(brandNeedle));

    list.push({
      id: `cand_${list.length + 1}`,
      url,
      kind: tag === 'svg' ? 'svg' : 'img',
      alt,
      classList,
      idAttr,
      filename,
      inHeaderOrNav,
      insideHomeLink,
      widthAttr: Number.isFinite(widthAttr) ? widthAttr : undefined,
      heightAttr: Number.isFinite(heightAttr) ? heightAttr : undefined,
      containsWordLogo,
      containsBrandHint,
      thirdPartyPenalty: isThirdPartyPenalty(url, domainName),
      snippet:
        tag === 'svg'
          ? Buffer.from(url.split(',')[1] || '', 'base64').toString('utf8').slice(0, 200)
          : undefined,
    });
  });

  // 2) inline background-image
  $('[style*="background-image"]').each((i, el) => {
    const $el = $(el);
    const style = $el.attr('style') || '';
    const m = style.match(/background-image:\s*url\((['"]?)(.*?)\1\)/i);
    const raw = m?.[2];
    if (!raw) return;
    const url = abs(raw);
    if (!url) return;

    const parents = $el
      .parents()
      .toArray()
      .map((p) => {
        const c = ($(p).attr('class') || '') + ' ' + ($(p).attr('id') || '');
        return c;
      })
      .join(' ');
    const inHeaderOrNav = HEADERISH.test(parents) || BRANDISH.test(parents);

    list.push({
      id: `cand_${list.length + 1}`,
      url,
      kind: 'bg',
      inHeaderOrNav,
      containsWordLogo: WORDS_LOGO.test(url),
      containsBrandHint: !!domainName && url.toLowerCase().includes(domainName),
      thirdPartyPenalty: isThirdPartyPenalty(url, domainName),
    });
  });

  // 3) favicons/icons (low priority)
  $('link[rel*="icon"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const url = abs(href);
    if (!url) return;

    list.push({
      id: `cand_${list.length + 1}`,
      url,
      kind: 'icon',
      containsWordLogo: WORDS_LOGO.test(url),
      containsBrandHint: !!domainName && url.toLowerCase().includes(domainName),
      thirdPartyPenalty: isThirdPartyPenalty(url, domainName),
    });
  });

  return list;
}

function isThirdPartyPenalty(url: string, domainName?: string): number {
  try {
    const u = new URL(url.startsWith('data:') ? 'https://local.invalid' : url);
    const host = u.hostname.toLowerCase();

    // Allow common first-party CDNs with low penalty
    const softAllowed = [
      'cloudfront.net',
      'cdn.shopify.com',
      'shopifycdn.com',
      'wixstatic.com',
      'squarespace-cdn.com',
      'wpenginepowered.com',
      'kinstacdn.com',
      'vercel-storage.com',
    ];
    if (softAllowed.some((d) => host === d || host.endsWith(`.${d}`))) return 0.15;

    if (!domainName) return 0.35;
    if (host.includes(domainName)) return 0.0;

    return 0.5; // soft penalty (not a hard exclude)
  } catch {
    return 0.35;
  }
}

function scoreCandidate(c: RichLogoCandidate): number {
  let s = 0;

  // positives
  if (c.kind === 'svg') s += 30;
  if (c.inHeaderOrNav) s += 30;
  if (c.insideHomeLink) s += 25;
  if (c.containsWordLogo) s += 25;
  if (c.containsBrandHint) s += 15;

  // tiny favicons
  if ((c.widthAttr && c.widthAttr <= SMALL_ICON_CUTOFF) || (c.heightAttr && c.heightAttr <= SMALL_ICON_CUTOFF)) s -= 20;

  // hero-ish
  if ((c.widthAttr && c.widthAttr >= 600) || (c.heightAttr && c.heightAttr >= 600)) s -= 10;

  // filename heuristics
  if (c.filename) {
    const f = c.filename.toLowerCase();
    if (/sprite|banner|hero|header|cover/.test(f)) s -= 30;
    if (/favicon/.test(f)) s -= 35;
  }

  // third-party penalty
  s -= (c.thirdPartyPenalty || 0) * 30;

  return s;
}

// ======= RESOLUTION + LEGACY FALLBACK =======
function resolveToAbsoluteUrl(url: string, baseUrl: string): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http')) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}

function findFallbackLogoCandidate($: CheerioAPI, baseUrl: string, domainName?: string): LogoCandidate | null {
  const elements = $('img, svg');

  for (const element of elements.toArray()) {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase() || '';

    if (tagName === 'svg' && !$element.attr('src')) {
      const svgHtml = $.html($element);
      if (svgHtml && svgHtml.length > 0 && svgHtml.length < 100000) {
        return {
          url: `data:image/svg+xml;base64,${Buffer.from(svgHtml).toString('base64')}`,
          source: 'inline-svg fallback',
        };
      }
      continue;
    }

    const rawSrc =
      $element.attr('src') || $element.attr('data-src') || $element.attr('data-lazy-src') || '';

    if (!rawSrc) continue;

    const absoluteUrl = resolveToAbsoluteUrl(rawSrc, baseUrl);
    if (!absoluteUrl) continue;

    if (!absoluteUrl.startsWith('data:') && isThirdPartyLogo(absoluteUrl, domainName)) {
      continue;
    }

    return {
      url: absoluteUrl,
      source: `${tagName || 'img'} (fallback)`,
    };
  }

  return null;
}

// ======= DOWNLOAD + VALIDATION =======
type DownloadResult =
  | {
      success: true;
      buffer: Buffer;
      contentType: string;
      url: string;
      isInlineSvg: boolean;
    }
  | { success: false; error: string };

async function downloadLogoCandidate(candidate: LogoCandidate): Promise<DownloadResult> {
  const { url } = candidate;

  if (url.startsWith('data:')) {
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return { success: false, error: 'Invalid inline logo data URL' };
    }
    return {
      success: true,
      buffer: Buffer.from(matches[2], 'base64'),
      contentType: matches[1],
      url,
      isInlineSvg: true,
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return { success: false, error: `Failed to download logo: ${response.status} ${response.statusText}` };
    }

    // best effort: trust header, otherwise default
    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      success: true,
      buffer,
      contentType,
      url,
      isInlineSvg: false,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? `Failed to download logo: ${error.message}` : 'Failed to download logo',
    };
  }
}

async function validateDownloadedLogo(result: DownloadResult): Promise<DownloadResult> {
  if (!result.success) return result;

  const { buffer, contentType } = result;

  // Must be image/*
  if (!contentType.startsWith('image/')) {
    return { success: false, error: 'Logo URL does not point to an image file' };
  }

  // Reject GIFs (often badges/spinners)
  if (contentType.includes('gif')) {
    return { success: false, error: 'GIF unlikely to be a primary logo' };
  }

  return result;
}

async function normalizeLogoBuffer(
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string; converted: boolean }> {
  const normalizedType = contentType || 'image/png';

  if (normalizedType === 'image/png') {
    return { buffer, contentType: normalizedType, converted: false };
  }

  try {
    const pngBuffer = await convertBufferToPng(buffer, extensionFromContentType(normalizedType));
    const pngBase64 = pngBuffer.toString('base64');
    console.log('🖼️ PNG conversion preview (base64 start):', pngBase64.slice(0, 120) + '...');
    console.log('🔗 Converted PNG data URL:', `data:image/png;base64,${pngBase64}`);
    return { buffer: pngBuffer, contentType: 'image/png', converted: true };
  } catch (error) {
    console.warn('PNG normalization failed, keeping original logo buffer:', error);
    return { buffer, contentType: normalizedType, converted: false };
  }
}

async function convertBufferToPng(buffer: Buffer, extension: string): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logo-scraper-'));
  const inputPath = path.join(tmpDir, `${randomUUID()}.${extension || 'img'}`);
  const outputPath = path.join(tmpDir, `${randomUUID()}.png`);

  try {
    await fs.writeFile(inputPath, buffer);
    await execFileAsync('magick', ['convert', inputPath, outputPath], { timeout: 20000 });
    return await fs.readFile(outputPath);
  } finally {
    await safeRemove(inputPath);
    await safeRemove(outputPath);
    await safeRemove(tmpDir, true);
  }
}

function extensionFromContentType(contentType: string): string {
  if (!contentType) return 'img';
  if (contentType.includes('svg')) return 'svg';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('bmp')) return 'bmp';
  return contentType.split('/')[1]?.split('+')[0] || 'img';
}

async function safeRemove(targetPath: string, recursive = false) {
  try {
    await fs.rm(targetPath, { recursive, force: true });
  } catch {
    // ignore cleanup errors
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ======= THIRD-PARTY FILTERS (LEGACY) =======
const THIRD_PARTY_DOMAINS = [
  'cookieyes.com',
  'cookie-cdn.com',
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.com',
  'twitter.com',
  'linkedin.com',
  'instagram.com',
  'youtube.com',
  'vimeo.com',
  'gravatar.com',
  'wp.com',
  'wordpress.com',
  'cloudflare.com',
  'jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
];

const THIRD_PARTY_PATH_PATTERNS: RegExp[] = [
  /\/badges?\b/,
  /\bbadge[-_]/,
  /\/icons?\/(whatsapp|facebook|twitter|instagram|linkedin|youtube|social|share|contact)/i,
  /\bicon[-_]?(whatsapp|facebook|twitter|instagram|linkedin|youtube|social|share)/i,
  /\bsocial[-_/]/,
  /\/social\//,
  /\bshare[-_/]/,
  /(?:\?|&)share=/,
  /(?:\?|&)social=/,
  /powered[-_]?by/,
  /\/whatsapp/i,
  /whatsapp[-_]/i,
  /\/facebook/i,
  /twitter[-_]/i,
  /\/twitter/i,
  /instagram[-_]/i,
  /\/instagram/i,
  /linkedin[-_]/i,
  /\/linkedin/i,
  /youtube[-_]/i,
  /\/youtube/i,
  /\/social[-_]media/i,
  /\/contact[-_]icons/i,
];

function isThirdPartyLogo(url: string, domainName?: string): boolean {
  const urlLower = url.toLowerCase();

  if (domainName) {
    const normalizedDomain = domainName.toLowerCase();
    const normalizedDomainClean = normalizedDomain.replace(/[^a-z0-9]/g, '');
    const urlClean = urlLower.replace(/[^a-z0-9]/g, '');
    if (urlLower.includes(normalizedDomain) || urlClean.includes(normalizedDomainClean)) {
      return false;
    }
  }

  let hostname = '';
  let pathStr = '';

  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.toLowerCase();
    pathStr = `${parsed.pathname}${parsed.search}${parsed.hash}`.toLowerCase();
  } catch {
    hostname = '';
    pathStr = urlLower;
  }

  for (const domain of THIRD_PARTY_DOMAINS) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) return true;
  }

  const haystack = `${hostname}${pathStr}`;
  for (const pattern of THIRD_PARTY_PATH_PATTERNS) {
    if (pattern.test(haystack)) return true;
  }

  return false;
}

// ======= CLI =======
const isCliExecution = (() => {
  if (typeof process === 'undefined' || !process.argv?.[1]) return false;
  try {
    const invokedPath = path.resolve(process.argv[1]);
    const currentFile = fileURLToPath(import.meta.url);
    return invokedPath === currentFile;
  } catch {
    return false;
  }
})();

if (isCliExecution) {
  const targetUrl = process.argv[2];

  if (!targetUrl) {
    console.error('Usage: npx tsx src/services/logoScraper.ts <websiteUrl>');
    process.exit(1);
  }

  scrapeWebsiteLogo(targetUrl)
    .then((result) => {
      console.log('🔍 Final scrape result:', result);

      if (result.success) {
        console.log(`🎯 Final logo URL: ${result.logoUrl}`);
      } else {
        console.error(`❌ Failed to find logo: ${result.error}`);
      }

      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Unexpected logo scraper error:', error);
      process.exit(1);
    });
}
