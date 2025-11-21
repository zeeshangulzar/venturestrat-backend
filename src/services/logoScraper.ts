// src/services/logoScraper.ts
import 'dotenv/config';
import axios from 'axios';
import sharp from 'sharp';
import { uploadPublicFile, getSignedUrlForAsset } from './storage.js';

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/scrape';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 80000);

export interface LogoScrapingResult {
  success: boolean;
  logoUrl?: string;
  error?: string;
}

export async function scrapeWebsiteLogo(websiteUrl: string): Promise<LogoScrapingResult> {
  try {
    const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    const baseUrl = new URL(url).origin;
    const domainName = new URL(url).hostname.replace('www.', '').split('.')[0].toLowerCase();

    if (!FIRECRAWL_API_KEY) {
      return { success: false, error: 'Missing Firecrawl API key' };
    }

    // ------------------------
    // 1) FETCH HTML
    // ------------------------
    const firecrawlResponse = await fetchFirecrawlHtml(url);
    const html =
      firecrawlResponse?.data?.data?.html ||
      firecrawlResponse?.data?.data?.rawHtml ||
      firecrawlResponse?.data?.html ||
      firecrawlResponse?.data?.rawHtml;
    
    if (!html || typeof html !== 'string' || html.trim().length < 20) {
      return { success: false, error: 'Could not load HTML from Firecrawl' };
    }

    const cleanedHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\s+/g, ' ')
    
    // ------------------------
    // 2) AI EXTRACTS LOGO
    // ------------------------
    const aiPick = await pickLogoFromHtml(cleanedHtml, baseUrl, domainName);
    console.log('🤖 AI logo pick result:', aiPick);

    if (!aiPick?.url) {
      return { success: false, error: 'No usable logo found in HTML' };
    }

    const logoUrl = aiPick.url;
    
    if (aiPick.isInlineSvg || logoUrl.trim().startsWith("<svg")) {
      console.log("🟢 Inline SVG detected. Converting to PNG…");

      const svgBuffer = Buffer.from(logoUrl, "utf8");

      let pngBuffer;
      try {
        pngBuffer = await sharp(svgBuffer).png().toBuffer();
      } catch (err) {
        return { success: false, error: "Failed to convert inline SVG to PNG" };
      }

      const filename = `logos/logo-${Date.now()}.png`;
      await uploadPublicFile(pngBuffer, filename, "image/png");
      const signedUrl = await getSignedUrlForAsset(filename);
      console.log("✅ Inline SVG converted successfully");
      const localDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      console.log('✅ Logo scraped and processed:', localDataUrl);
      return { success: true, logoUrl: signedUrl };
    }

    // ------------------------
    // 3) DOWNLOAD LOGO
    // ------------------------
    const downloaded = await downloadImage(logoUrl);
    if (!downloaded.success) return downloaded;

    // ------------------------
    // 4) CONVERT → PNG
    // ------------------------
    const normalized = await convertToPng(downloaded.buffer);

    // ------------------------
    // 5) UPLOAD to storage
    // ------------------------
    const filename = `logos/logo-${Date.now()}.png`;
    await uploadPublicFile(normalized, filename, 'image/png');
    const signedUrl = await getSignedUrlForAsset(filename);
    const localDataUrl = `data:image/png;base64,${normalized.toString('base64')}`;

    console.log('✅ Logo scraped and processed:', localDataUrl);
    return {
      success: true,
      logoUrl: signedUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

//
// OPENAI LOGO EXTRACTOR (Option B - Visual + Content Based)
//
async function pickLogoFromHtml(html: string, baseUrl: string, domainName: string) {
  console.log('🤖 Asking OpenAI to pick the logo from HTML...', baseUrl);
  const payload = {
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'logo_choice_simple',
        schema: {
          type: 'object',
          properties: {
            url: { type: ['string', 'null'] },
            reason: { type: 'string' },
            confidence: { type: 'number' }
          },
          required: ['url', 'reason', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: 'system',
        content: `
          You are a strict BRAND LOGO extractor.
          Your ONLY job:
          → Identify the MAIN COMPANY LOGO (the brand identity of the website)
          → Return the direct URL to the real logo asset (SVG or PNG)
          → If the logo is inline <svg> with no external file, extract the full SVG markup instead.

          ABSOLUTE RULES:

          1. You MUST NOT return the homepage URL or any non-image URL.  
            This is forbidden: "https://example.com/".

          2. Valid returned values MUST be one of:
            - A full absolute image URL ending in .svg, .png, .jpg, .jpeg, .webp
            - OR inline SVG markup starting with "<svg"

          3. Strongest matches (order matters):
            a. <img> where src contains:
                  "logo", "brand", the domainName, or similar branding keywords
            b. <img> located inside <header>, <nav>, ".site-header", ".navbar", ".topbar"
            c. <svg> in header/nav that visually represents the brand (inline logo)
            d. <meta property="og:logo"> or <meta property="og:image"> ONLY if it is the BRAND logo
            e. <link rel="icon"> ONLY if it is large (>= 96×96) AND nothing better exists

          4. DO NOT choose:
            ✘ Homepage URL  
            ✘ Favicon 16×16 or 32×32  
            ✘ Social icons (fb, twitter, linkedin)  
            ✘ Section logos (events, products, sponsors, etc.)  
            ✘ Country flags  
            ✘ Article thumbnails  
            ✘ App icons unless the site itself is an app brand

          5. If the logo is inline <svg> with no external file:
            → Return the FULL SVG markup in the "url" field exactly as text.

          6. If the URL is relative:
            → Convert to absolute using baseUrl.

          7. The returned "url" MUST NOT equal the baseUrl or any non-image link.
          8. If the extracted logo comes from <img src="..."> and the src is a RELATIVE path
            (starts with "/" or "./" or "../"), you MUST convert it into a FULL ABSOLUTE URL
            using the provided baseUrl, exactly like: new URL(src, baseUrl).href

            Example:
              baseUrl: http://abc.com
              src: /templets/default/images/logo.png
              return: http://abc.com/templets/default/images/logo.png

            Never invent or guess folder names such as /assets/, /static/, /images/ unless they exist in the HTML.


          OUTPUT STRICT JSON:
          {
            "url": "<absolute logo URL OR inline SVG markup>",
            "reason": "Why this is the main brand logo",
            "confidence": 0.0 – 1.0
          }
        `
      },
      {
      role: "user",
        content: `
          Base URL: ${baseUrl}
          Domain: ${domainName}

          Here is the FULL HTML content:
          ${html}

          Return STRICT JSON ONLY.
        `
      }
    ]
  };

  const res = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    OPENAI_TIMEOUT_MS
  );

  const data = await res.json();

  // Token usage debugging
  if (data.usage) {
    console.log('🔥 OpenAI tokens:', data.usage);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content);
  if (!parsed.url) return null;

  
  // Inline SVG detectionconst logoUrl = aiPick.url;
  if (parsed.url.trim().startsWith("<svg")) {
    return {
      url: parsed.url.trim(), // raw SVG markup
      reason: parsed.reason,
      confidence: parsed.confidence,
      isInlineSvg: true
    };
  }

  return {
    url: resolveUrl(parsed.url, baseUrl),
    reason: parsed.reason,
    confidence: parsed.confidence,
    isInlineSvg: false
  };

}

// DOWNLOAD IMAGE
async function downloadImage(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { success: false, error: `Failed to download: ${res.status}` };

    const buffer = Buffer.from(await res.arrayBuffer());
    return { success: true, buffer, contentType: res.headers.get('content-type') || 'image/png' };
  } catch (err) {
    return { success: false, error: 'Failed to download logo' };
  }
}

// PNG CONVERSION
async function convertToPng(buffer?: Buffer): Promise<Buffer> {
  // If there's no buffer, return an empty Buffer to keep the return type consistent.
  if (!buffer) return Buffer.from([]);

  try {
    const png = await sharp(buffer).png({ quality: 90 }).toBuffer();
    return png;
  } catch {
    // On failure, return the original buffer (which is guaranteed to exist here).
    return buffer;
  }
}

// FIRECRAWL FETCH
async function fetchFirecrawlHtml(url: string) {
  return axios.post(
    FIRECRAWL_API_URL,
    {
      url,
      formats: ['html'],
      onlyMainContent: false,
      waitFor: 4000,
      timeout: 45000,
    },
    {
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
      timeout: 50000,
    }
  );
}

function resolveUrl(url: string, baseUrl: string) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log("⏳ OpenAI request timed out, aborting…");
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ======= CLI MODE =======
if (process.argv[1] && process.argv[1].includes('logoScraper.ts')) {
  const targetUrl = process.argv[2];

  if (!targetUrl) {
    console.error('Usage: npx tsx src/services/logoScraper.ts <websiteUrl>');
    process.exit(1);
  }

  console.log("🚀 Starting logo scrape for:", targetUrl);

  scrapeWebsiteLogo(targetUrl)
    .then((result) => {
      console.log("🔍 Final result:", result);

      if (result.success) {
        console.log("🎯 Logo URL / data URL:", result.logoUrl);
      } else {
        console.error("❌ Error:", result.error);
      }

      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("❌ Unexpected error:", err);
      process.exit(1);
    });
}
