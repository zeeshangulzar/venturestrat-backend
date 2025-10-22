import { load } from 'cheerio';
import axios from 'axios';
import { uploadPublicFile, getSignedUrlForAsset } from './storage.js';

export interface LogoScrapingResult {
  success: boolean;
  logoUrl?: string;
  error?: string;
}

export async function scrapeWebsiteLogo(websiteUrl: string): Promise<LogoScrapingResult> {
  try {
    // Ensure URL has protocol
    const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    
    // Enhanced headers to mimic real browser (from batch test)
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Connection': 'keep-alive'
    };

    // Use axios instead of fetch for better control
    const response = await axios.get(url, {
      timeout: 15000,
      headers: headers,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });

    const $ = load(response.data);

    // Enhanced logo selectors (from batch test with 91% success rate)
    const logoSelectors = [
      { selector: 'a[class*="Logo"] svg', description: 'SVG inside elements with "Logo" in class' },
      { selector: 'svg[aria-label*="logo"]', description: 'SVG with "logo" in aria-label' },
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
      { selector: 'link[rel="icon"]', description: 'Favicon links' },
      { selector: 'link[rel="shortcut icon"]', description: 'Shortcut icon links' },
      { selector: 'link[rel="apple-touch-icon"]', description: 'Apple touch icon links' },
      { selector: 'meta[property="og:image"]', description: 'Open Graph images' },
    ];

    let logoUrl: string | null = null;
    let foundSelector: string | null = null;
    let allFoundImages: Array<{
      url: string;
      selector: string;
      element: string;
      alt: string;
      class: string;
    }> = [];

    // Enhanced logo detection logic (from batch test)
    for (const { selector, description } of logoSelectors) {
      const elements = $(selector);
      
      if (elements.length > 0) {
        elements.each((index, element) => {
          const $element = $(element);
          let src: string | null = null;
          let elementType = $element.prop('tagName')?.toLowerCase() || '';
          
          if (elementType === 'img') {
            src = $element.attr('src') || $element.attr('data-src') || $element.attr('data-lazy-src') || null;
          } else if (elementType === 'link') {
            src = $element.attr('href') || null;
          } else if (elementType === 'meta') {
            src = $element.attr('content') || null;
          } else if (elementType === 'svg') {
            // For SVG elements, try to find src or use the element itself
            src = $element.attr('src') || $element.attr('data-src') || null;
            if (!src) {
              // If no src, we might need to handle inline SVGs differently
              return; // Use return instead of continue in callback function
            }
          }
          
          if (src) {
            // Convert relative URLs to absolute
            let absoluteUrl = src;
            
            if (src.startsWith('//')) {
              absoluteUrl = `https:${src}`;
            } else if (src.startsWith('/')) {
              absoluteUrl = new URL(src, url).href;
            } else if (src.startsWith('http')) {
              absoluteUrl = src;
            } else {
              absoluteUrl = new URL(src, url).href;
            }
            
            allFoundImages.push({
              url: absoluteUrl,
              selector: selector,
              element: elementType,
              alt: $element.attr('alt') || '',
              class: $element.attr('class') || ''
            });
            
            if (!logoUrl && isLikelyLogo(absoluteUrl, $element.attr('alt'), $element.attr('class'))) {
              logoUrl = absoluteUrl;
              foundSelector = selector;
            }
          }
        });
      }
    }

    // If no logo found with selectors, try to find the best candidate
    if (!logoUrl && allFoundImages.length > 0) {
      // Sort by likelihood of being a logo
      const sortedImages = allFoundImages.sort((a, b) => {
        const scoreA = getLogoScore(a);
        const scoreB = getLogoScore(b);
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

    // Download the logo
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
    const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
    const contentType = logoResponse.headers.get('content-type') || 'image/png';
    
    // Validate it's actually an image
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        error: 'Logo URL does not point to an image file'
      };
    }

    // Generate filename
    const timestamp = Date.now();
    const extension = contentType.split('/')[1] || 'png';
    const filename = `logo-${timestamp}.${extension}`;
    const fileKey = `logos/${filename}`;

    // Upload to B2
    await uploadPublicFile(logoBuffer, fileKey, contentType);

    // Generate signed URL (expires in 7 days)
    const finalLogoUrl = await getSignedUrlForAsset(fileKey);

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

// Helper function to determine if an image is likely a logo (from batch test)
function isLikelyLogo(url: string, alt?: string, className?: string): boolean {
  const urlLower = url.toLowerCase();
  const altLower = (alt || '').toLowerCase();
  const classLower = (className || '').toLowerCase();
  
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
function getLogoScore(image: { url: string; alt: string; class: string }): number {
  let score = 0;
  const urlLower = image.url.toLowerCase();
  const altLower = image.alt.toLowerCase();
  const classLower = image.class.toLowerCase();
  
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
  
  // File type scoring
  if (urlLower.includes('.svg')) score += 5; // SVGs are often logos
  if (urlLower.includes('.png')) score += 3;
  if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) score += 2;
  
  return score;
}
