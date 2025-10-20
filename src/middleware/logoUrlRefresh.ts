import { PrismaClient } from '@prisma/client';
import { isSignedUrl, refreshSignedUrl } from '../services/storage';

const prisma = new PrismaClient();

// Check if a signed URL is expired or about to expire (within 1 day)
export const isUrlExpiringSoon = (url: string): boolean => {
  if (!isSignedUrl(url)) return false;
  
  try {
    const urlObj = new URL(url);
    const expiresParam = urlObj.searchParams.get('X-Amz-Expires');
    if (expiresParam) {
      const expiresInSeconds = parseInt(expiresParam);
      // If expires in less than 1 day (86400 seconds), consider it expiring soon
      return expiresInSeconds < 86400;
    }
  } catch (error) {
    console.error('Error checking URL expiration:', error);
  }
  
  return false;
};

// Refresh logo URLs that are expiring soon
export const refreshExpiringLogoUrls = async () => {
  try {
    console.log('Checking for expiring logo URLs...');
    
    // Find users with logo URLs that are expiring soon
    const users = await prisma.user.findMany({
      where: {
        companyLogo: {
          not: null,
        },
      },
      select: {
        id: true,
        companyLogo: true,
      },
    });

    let refreshedCount = 0;
    
    for (const user of users) {
      if (user.companyLogo && isUrlExpiringSoon(user.companyLogo)) {
        try {
          console.log(`Refreshing logo URL for user ${user.id}`);
          const refreshedUrl = await refreshSignedUrl(user.companyLogo);
          
          await prisma.user.update({
            where: { id: user.id },
            data: { companyLogo: refreshedUrl },
          });
          
          refreshedCount++;
        } catch (error) {
          console.error(`Failed to refresh logo URL for user ${user.id}:`, error);
        }
      }
    }
    
    if (refreshedCount > 0) {
      console.log(`Refreshed ${refreshedCount} logo URLs`);
    }
    
  } catch (error) {
    console.error('Error refreshing logo URLs:', error);
  }
};

// Run the refresh check periodically (every 6 hours)
export const startLogoUrlRefreshScheduler = () => {
  // Run immediately
  refreshExpiringLogoUrls();
  
  // Then run every 6 hours
  setInterval(refreshExpiringLogoUrls, 6 * 60 * 60 * 1000);
  
  console.log('Logo URL refresh scheduler started');
};
