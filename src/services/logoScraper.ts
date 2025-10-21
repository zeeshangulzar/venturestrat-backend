import { load } from 'cheerio';
import { uploadPublicFile, getSignedUrlForAsset } from './storage';

export interface LogoScrapingResult {
  success: boolean;
  logoUrl?: string;
  error?: string;
}

export async function scrapeWebsiteLogo(websiteUrl: string): Promise<LogoScrapingResult> {
  try {
    // Ensure URL has protocol
    const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    
    // Fetch the website content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch website: ${response.status} ${response.statusText}`
      };
    }

    const html = await response.text();
    const $ = load(html);

    // Common logo selectors to try
    const logoSelectors = [
      'img[alt*="logo" i]',
      'img[class*="logo" i]',
      'img[id*="logo" i]',
      'img[src*="logo" i]',
      '.logo img',
      '#logo img',
      'header img',
      'nav img',
      '.header img',
      '.navbar img',
      '.brand img',
      '.company-logo img',
      'img[alt*="brand" i]',
      'img[class*="brand" i]'
    ];

    let logoElement = null;
    let logoSrc = '';

    // Try each selector
    for (const selector of logoSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        logoElement = element;
        logoSrc = element.attr('src') || element.attr('data-src') || '';
        if (logoSrc) break;
      }
    }

    // If no logo found with selectors, try to find the first image in header/nav
    if (!logoSrc) {
      const headerImages = $('header img, nav img, .header img, .navbar img').first();
      if (headerImages.length > 0) {
        logoSrc = headerImages.attr('src') || headerImages.attr('data-src') || '';
      }
    }

    if (!logoSrc) {
      return {
        success: false,
        error: 'No logo found on the website'
      };
    }

    // Make URL absolute if it's relative
    let absoluteLogoUrl = logoSrc;
    if (logoSrc.startsWith('/')) {
      const urlObj = new URL(url);
      absoluteLogoUrl = `${urlObj.protocol}//${urlObj.host}${logoSrc}`;
    } else if (!logoSrc.startsWith('http')) {
      absoluteLogoUrl = `${url}/${logoSrc}`;
    }

    // Download the logo
    const logoResponse = await fetch(absoluteLogoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
    const logoUrl = await getSignedUrlForAsset(fileKey);

    return {
      success: true,
      logoUrl
    };

  } catch (error) {
    console.error('Error scraping logo:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
