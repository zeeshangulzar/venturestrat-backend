import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { scrapeWebsiteLogo } from '../services/logoScraper.js';

const router = Router();
const prisma = new PrismaClient();

// Validate website URL
function isValidUrl(string: string): boolean {
  try {
    const url = string.startsWith('http') ? string : `https://${string}`;
    new URL(url);
    return true;
  } catch (_) {
    return false;
  }
}

// Update user company website and logo
router.post('/company-website', async (req, res) => {
  try {
    const { userId, websiteUrl } = req.body;

    if (!userId || !websiteUrl) {
      return res.status(400).json({ error: 'User ID and website URL are required' });
    }

    // Validate website URL
    if (!isValidUrl(websiteUrl)) {
      return res.status(400).json({ error: 'Invalid website URL format' });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Scrape logo from website
    const logoResult = await scrapeWebsiteLogo(websiteUrl);
    
    let logoUrl = null;
    if (logoResult.success && logoResult.logoUrl) {
      logoUrl = logoResult.logoUrl;
    }

    // Update user with website and logo
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        companyWebsite: websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`,
        companyLogo: logoUrl
      }
    });

    res.json({
      message: 'Company website and logo updated successfully',
      data: {
        companyWebsite: updatedUser.companyWebsite,
        companyLogo: updatedUser.companyLogo,
        logoScraped: logoResult.success,
        logoError: logoResult.error
      }
    });

  } catch (error) {
    console.error('Error updating company website:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;