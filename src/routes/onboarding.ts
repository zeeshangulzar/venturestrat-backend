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

    // Update user with website immediately (no logo yet)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        companyWebsite: websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`,
        companyLogo: null // Will be updated in background
      }
    });

    // Scrape logo in background (fire and forget)
    scrapeWebsiteLogo(websiteUrl)
      .then(async (logoResult) => {
        if (logoResult.success && logoResult.logoUrl) {
          await prisma.user.update({
            where: { id: userId },
            data: { companyLogo: logoResult.logoUrl }
          });
          console.log(`✅ Logo scraped and updated for user ${userId}`);
        } else {
          console.log(`⚠️ Logo scraping failed for user ${userId}:`, logoResult.error);
        }
      })
      .catch((error) => {
        console.error(`❌ Logo scraping error for user ${userId}:`, error);
      });

    // Return immediately - don't wait for logo
    res.json({
      message: 'Company website updated successfully. Logo is being processed.',
      data: {
        companyWebsite: updatedUser.companyWebsite,
        companyLogo: null, // Will be updated shortly
        logoScraping: 'in_progress'
      }
    });

  } catch (error) {
    console.error('Error updating company website:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;