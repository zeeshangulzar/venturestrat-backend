import { load } from 'cheerio';
import axios from 'axios';
import { uploadPublicFile, getSignedUrlForAsset } from './storage.js';

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/scrape';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

// Shared selectors to mirror the Firecrawl test harness + inline SVG support
const logoSelectors = [
  // SVG-specific selectors (prioritized for inline SVGs)
  { selector: 'a[class*="Logo"] svg', description: 'SVG inside elements with "Logo" in class' },
  { selector: 'svg[class*="logo" i]', description: 'SVG with "logo" in class' },
  { selector: 'svg[class*="Logo"]', description: 'SVG with "Logo" in class (case sensitive)' },
  { selector: 'svg[aria-label*="logo"]', description: 'SVG with "logo" in aria-label' },
  { selector: '.logo svg', description: 'SVG inside .logo container' },
  { selector: '#logo svg', description: 'SVG inside #logo container' },
  { selector: '.header svg', description: 'SVG inside .header container' },
  { selector: '.navbar svg', description: 'SVG inside .navbar container' },
  { selector: '.brand svg', description: 'SVG inside .brand container' },
  { selector: 'svg[id*="logo" i]', description: 'SVG with "logo" in ID' },
  
  // Image selectors
  { selector: 'img[alt*="logo" i]', description: 'Images with "logo" in alt text' },
  { selector: 'img[class*="logo" i]', description: 'Images with "logo" in class' },
  { selector: 'img[id*="logo" i]', description: 'Images with "logo" in ID' },
  { selector: 'img[src*="Logo"]', description: 'Images with "Logo" in src (case sensitive)' },
  { selector: '.logo img', description: 'Images inside .logo container' },
  { selector: '#logo img', description: 'Images inside #logo container' },
  { selector: '.header img', description: 'Images inside .header container' },
  { selector: '.navbar img', description: 'Images inside .navbar container' },
  { selector: '.brand img', description: 'Images inside .brand container' },
  { selector: '.site-header img', description: 'Images inside .site-header container' },
  { selector: '.main-header img', description: 'Images inside .main-header container' },
  { selector: 'img[src*="logo"]', description: 'Images with "logo" in src' },
  { selector: 'img[src*="brand"]', description: 'Images with "brand" in src' },
  { selector: 'img[src*="header"]', description: 'Images with "header" in src' },
  
  // Meta and link tags
  { selector: 'link[rel="icon"]', description: 'Favicon links' },
  { selector: 'link[rel="shortcut icon"]', description: 'Shortcut icon links' },
  { selector: 'link[rel="apple-touch-icon"]', description: 'Apple touch icon links' },
  { selector: 'meta[property="og:image"]', description: 'Open Graph images' },
  { selector: 'meta[name="twitter:image"]', description: 'Twitter images' },
  
  // Generic image selectors (lower priority)
  { selector: 'img[src*="favicon"]', description: 'Images with "favicon" in src' },
  { selector: 'img[src*="icon"]', description: 'Images with "icon" in src' },
  { selector: 'img[src*="svg"]', description: 'SVG images (often logos)' },
  { selector: 'img[src*="png"]', description: 'PNG images' },
  { selector: 'img[src*="jpg"]', description: 'JPG images' },
  { selector: 'img[src*="jpeg"]', description: 'JPEG images' }
];

export interface LogoScrapingResult {
  success: boolean;
  logoUrl?: string;
  error?: string;
}

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
        error: 'Firecrawl API key is not configured'
      };
    }

    const firecrawlResponse = await axios.post(
      FIRECRAWL_API_URL,
      {
        url,
        formats: ['html', 'markdown'],
        onlyMainContent: false,
        waitFor: 2000,
        timeout: 30000
      },
      {
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 35000
      }
    );

    const html =
      firecrawlResponse.data?.data?.html ||
      firecrawlResponse.data?.html;

    if (!html) {
      return {
        success: false,
        error: 'Firecrawl response did not include HTML content'
      };
    }

    const $ = load(html);

    let logoUrl: string | null = null;
    let foundSelector: string | null = null;
    let allFoundImages: Array<{
      url: string;
      selector: string;
      element: string;
      alt: string;
      class: string;
    }> = [];

    // Enhanced logo detection logic with inline SVG support
    for (const { selector } of logoSelectors) {
      const elements = $(selector);
      
      if (elements.length > 0) {
        elements.each((index, element) => {
          const $element = $(element);
          let src: string | null = null;
          let elementType = $element.prop('tagName')?.toLowerCase() || '';
          let isInlineSvg = false;
          
          if (elementType === 'img') {
            src = $element.attr('src') || $element.attr('data-src') || $element.attr('data-lazy-src') || null;
          } else if (elementType === 'link') {
            src = $element.attr('href') || null;
          } else if (elementType === 'meta') {
            src = $element.attr('content') || null;
          } else if (elementType === 'svg') {
            // For SVG elements, check if it has a src attribute first
            src = $element.attr('src') || $element.attr('data-src') || null;
            
            if (!src) {
              // Handle inline SVG - convert to data URL
              const svgHtml = $.html($element);
              if (svgHtml && svgHtml.length > 0 && svgHtml.length < 100000) { // Reasonable size limit
                // Create a data URL from the inline SVG
                src = `data:image/svg+xml;base64,${Buffer.from(svgHtml).toString('base64')}`;
                isInlineSvg = true;
              } else {
                return; // SVG too large or empty, skip it
              }
            }
          }
          
          if (src) {
            // Convert relative URLs to absolute (skip for data URLs and inline SVGs)
            let absoluteUrl = src;
            
            if (src.startsWith('data:')) {
              // For inline SVGs and data URLs, use as-is
              absoluteUrl = src;
            } else if (src.startsWith('//')) {
              absoluteUrl = `https:${src}`;
            } else if (src.startsWith('/')) {
              absoluteUrl = new URL(src, baseUrl).href;
            } else if (src.startsWith('http')) {
              absoluteUrl = src;
            } else {
              absoluteUrl = new URL(src, baseUrl).href;
            }
            
            const imageData = {
              url: absoluteUrl,
              selector: selector,
              element: isInlineSvg ? 'inline-svg' : elementType,
              alt: $element.attr('alt') || $element.attr('aria-label') || $element.find('title').text() || '',
              class: $element.attr('class') || ''
            };
            
            allFoundImages.push(imageData);
            
            // Check if this is a third-party logo and log it
            if (isThirdPartyLogo(absoluteUrl)) {
              console.log(`⏭️  Skipping third-party logo: ${absoluteUrl.substring(0, 80)}...`);
            }
            
            // Don't select logos early - let the scoring system decide!
            // This ensures we compare ALL logos and pick the best one
          }
        });
      }
    }

    // If no logo found with selectors, try to find the best candidate
    if (!logoUrl && allFoundImages.length > 0) {
      // Sort by likelihood of being a logo
      const sortedImages = allFoundImages.sort((a, b) => {
        const scoreA = getLogoScore(a, domainName);
        const scoreB = getLogoScore(b, domainName);
        return scoreB - scoreA;
      });
      
      if (sortedImages.length > 0) {
        logoUrl = sortedImages[0].url;
        foundSelector = sortedImages[0].selector;
      }
    }

    if (!logoUrl) {
      return {
        success: false,
        error: 'No logo found with any selector'
      };
    }

    // Handle logo download (or data URL extraction)
    let logoBuffer: Buffer;
    let contentType: string;

    if (logoUrl.startsWith('data:')) {
      // Handle data URL (inline SVG)
      const matches = logoUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return {
          success: false,
          error: 'Invalid data URL format'
        };
      }
      
      contentType = matches[1];
      logoBuffer = Buffer.from(matches[2], 'base64');
      
      console.log('📦 Extracted inline SVG');
    } else {
      // Download the logo from URL
      const logoResponse = await fetch(logoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!logoResponse.ok) {
        return {
          success: false,
          error: `Failed to download logo: ${logoResponse.status} ${logoResponse.statusText}`
        };
      }

      // Get logo data
      logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
      contentType = logoResponse.headers.get('content-type') || 'image/png';
    }
    
    // Validate it's actually an image
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        error: 'Logo URL does not point to an image file'
      };
    }
    
    // Warn if logo is suspiciously large (likely a hero/banner image)
    const logoSizeMB = logoBuffer.length / (1024 * 1024);
    if (logoSizeMB > 1) {
      console.log(`⚠️  Warning: Logo is very large (${logoSizeMB.toFixed(2)} MB) - might be a hero image, not a logo`);
    }

    // Generate filename
    const timestamp = Date.now();
    const extension = contentType.split('/')[1] || 'png';
    const filename = `logo-${timestamp}.${extension}`;
    const fileKey = `logos/${filename}`;

    // ===== CLOUD UPLOAD (COMMENTED OUT FOR LOCAL TESTING) =====
    await uploadPublicFile(logoBuffer, fileKey, contentType);
    const finalLogoUrl = await getSignedUrlForAsset(fileKey);
    // ===== END CLOUD UPLOAD =====

    // For local testing, return the original logo URL
    // const finalLogoUrl = logoUrl;
    const isInlineSvg = logoUrl.startsWith('data:');

    // Log details for local testing
    console.log('✅ Logo found successfully!');
    console.log('📍 Found using selector:', foundSelector);
    
    if (isInlineSvg) {
      console.log('🎨 Type: Inline SVG (embedded in HTML)');
      console.log('🔗 Data URL:', logoUrl.substring(0, 100) + '... (truncated)');
    } else {
      console.log('🔗 Original URL:', logoUrl);
    }
    
    console.log('📦 Content Type:', contentType);
    console.log('📏 Logo Size:', `${logoBuffer.length} bytes (${(logoBuffer.length / 1024).toFixed(2)} KB)`);
    console.log('💾 Would save as:', fileKey);

    return {
      success: true,
      logoUrl: finalLogoUrl
    };

  } catch (error) {
    console.error('Error scraping logo:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// List of third-party domains to exclude (not company logos)
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
  'badge',
  'icon-',
  'social',
  'share'
];

// Helper function to check if URL is from a third-party (not the company logo)
function isThirdPartyLogo(url: string): boolean {
  const urlLower = url.toLowerCase();
  
  // Check against known third-party domains
  for (const domain of THIRD_PARTY_DOMAINS) {
    if (urlLower.includes(domain)) {
      return true;
    }
  }
  
  // Check for common non-logo patterns
  if (urlLower.includes('social-') || 
      urlLower.includes('share-') || 
      urlLower.includes('badge-') ||
      urlLower.includes('/badges/') ||
      urlLower.includes('/icons/') ||
      urlLower.includes('powered-by') ||
      urlLower.includes('poweredby')) {
    return true;
  }
  
  return false;
}

// Helper function to determine if an image is likely a logo (from batch test)
function isLikelyLogo(url: string, alt?: string, className?: string): boolean {
  const urlLower = url.toLowerCase();
  const altLower = (alt || '').toLowerCase();
  const classLower = (className || '').toLowerCase();
  
  // Exclude third-party logos first
  if (isThirdPartyLogo(url)) {
    return false;
  }
  
  // Check for logo keywords
  const logoKeywords = ['logo', 'brand', 'header', 'navbar', 'site-title'];
  
  for (const keyword of logoKeywords) {
    if (urlLower.includes(keyword) || altLower.includes(keyword) || classLower.includes(keyword)) {
      return true;
    }
  }
  
  // Check if it's in a likely logo container
  if (classLower.includes('logo') || classLower.includes('brand') || classLower.includes('header')) {
    return true;
  }
  
  return false;
}

// Helper function to score how likely an image is to be a logo (from batch test)
function getLogoScore(image: { url: string; alt: string; class: string; selector: string }, domainName?: string): number {
  let score = 0;
  const urlLower = image.url.toLowerCase();
  const altLower = image.alt.toLowerCase();
  const classLower = image.class.toLowerCase();
  const selectorLower = image.selector.toLowerCase();
  
  // HEAVILY penalize third-party logos
  if (isThirdPartyLogo(image.url)) {
    return -1000; // Basically exclude these
  }
  
  // MASSIVE boost if URL contains the domain name (e.g., "box-group_logo.svg" for boxgroup.com)
  if (domainName) {
    // Remove hyphens and underscores for matching
    const cleanDomain = domainName.replace(/[-_]/g, '');
    const cleanUrl = urlLower.replace(/[-_]/g, '');
    
    if (cleanUrl.includes(cleanDomain)) {
      score += 100; // HUGE boost for domain name match
    }
    
    // Also check for variations (boxgroup vs box-group vs box_group)
    if (urlLower.includes(domainName) || 
        urlLower.includes(domainName.replace(/-/g, '_')) ||
        urlLower.includes(domainName.replace(/_/g, '-'))) {
      score += 100;
    }
  }
  
  // HEAVILY BOOST logos in header/navbar (most likely to be company logo)
  if (selectorLower.includes('header') || 
      selectorLower.includes('navbar') || 
      selectorLower.includes('nav ')) {
    score += 50; // Big boost for header/navbar logos
  }
  
  // HUGE boost for SVGs with aria-label containing "logo"
  if (selectorLower.includes('aria-label') && altLower.includes('logo')) {
    score += 80; // Aria-labels are very specific and intentional
  }
  
  // Boost for logo-specific selectors
  if (selectorLower.includes('.logo') || selectorLower.includes('#logo')) {
    score += 30;
  }
  
  // URL-based scoring
  if (urlLower.includes('logo')) score += 10;
  if (urlLower.includes('brand')) score += 8;
  if (urlLower.includes('header')) score += 6;
  if (urlLower.includes('favicon')) score += 4;
  if (urlLower.includes('icon')) score += 3;
  
  // Alt text scoring
  if (altLower.includes('logo')) score += 10;
  if (altLower.includes('brand')) score += 8;
  if (altLower.includes('header')) score += 6;
  
  // Class scoring
  if (classLower.includes('logo')) score += 10;
  if (classLower.includes('brand')) score += 8;
  if (classLower.includes('header')) score += 6;
  if (classLower.includes('navbar') || classLower.includes('nav-')) score += 8;
  
  // Penalize social/share icons
  if (altLower.includes('social') || altLower.includes('share') || altLower.includes('follow')) {
    score -= 50;
  }
  
  // Penalize portfolio company logos (common pattern)
  if (altLower.includes('portfolio') || 
      altLower.includes('client') || 
      altLower.includes('partner') ||
      classLower.includes('portfolio') ||
      classLower.includes('client')) {
    score -= 100;
  }
  
  // Penalize if URL contains a different company name (portfolio company logos)
  // Common patterns: company_name.png, companyname.svg, etc.
  if (domainName) {
    const urlFileName = urlLower.split('/').pop() || '';
    const cleanFileName = urlFileName.replace(/\.(png|jpg|jpeg|svg|webp|gif).*$/, '');
    const cleanDomain = domainName.replace(/[-_]/g, '');
    const cleanFileNameNormalized = cleanFileName.replace(/[-_]/g, '');
    
    // If filename has underscores/hyphens and doesn't match domain, likely a portfolio company
    if ((cleanFileName.includes('_') || cleanFileName.includes('-')) && 
        !cleanFileNameNormalized.includes(cleanDomain) &&
        cleanFileName.length > 5) { // Avoid penalizing short filenames
      score -= 80; // Likely a portfolio company logo
    }
  }
  
  // File type scoring
  if (urlLower.includes('.svg')) score += 5; // SVGs are often logos
  if (urlLower.includes('.png')) score += 3;
  if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) score += 2;
  
  // Penalize very large image dimensions (likely hero images, not logos)
  if (urlLower.includes('w_1905') || // Wix large images
      urlLower.includes('w_2000') ||
      urlLower.includes('w_3000') ||
      urlLower.includes('1920x') ||
      urlLower.includes('2000x')) {
    score -= 200; // Heavy penalty for huge images
  }
  
  // Check for large Wix images (w_XXXX pattern)
  if (urlLower.includes('/fill/w_')) {
    const widthMatch = urlLower.match(/\/fill\/w_(\d+)/);
    if (widthMatch && parseInt(widthMatch[1]) > 1000) {
      score -= 200; // Heavy penalty for images > 1000px wide
    }
  }
  
  return score;
}
