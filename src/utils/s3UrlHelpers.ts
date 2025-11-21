import { getSignedUrlForAsset } from '../services/storage.js';

// Build your bucket prefix dynamically from env
export const BUCKET_PUBLIC_PREFIX = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`;

/**
 * Strip signed params and extract the S3 key from a URL.
 */
export const stripSignedUrlAndGetKey = (url: string): string | null => {
  try {
    if (!url.startsWith(BUCKET_PUBLIC_PREFIX)) {
      return null; // Not our bucket → skip
    }

    // Remove the query params and extract key
    const cleanUrl = url.split('?')[0];
    const key = cleanUrl.replace(BUCKET_PUBLIC_PREFIX, '');

    return key || null;
  } catch {
    return null;
  }
};

/**
 * Determine whether an S3 signed URL is expired based on X-Amz-Date and X-Amz-Expires.
 */
export const isSignedUrlExpired = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const expires = parsed.searchParams.get('X-Amz-Expires');
    const date = parsed.searchParams.get('X-Amz-Date');

    if (!expires || !date) return true;

    const issuedAt = parseAwsDate(date);
    const expiresAt = new Date(issuedAt.getTime() + parseInt(expires) * 1000);

    return Date.now() >= expiresAt.getTime();
  } catch {
    return true;
  }
};



/**
 * Smart refresh function:
 * - Refresh only if expired AND belongs to your S3 bucket
 * - Remove old signature query params
 * - Re-generate with getSignedUrlForAsset()
 */
export const smartRefreshAvatarUrl = async (avatarUrl: string): Promise<string> => {
  if (!avatarUrl.startsWith(BUCKET_PUBLIC_PREFIX)) {
    return avatarUrl; // External image → return as-is
  }

  const fileKey = stripSignedUrlAndGetKey(avatarUrl);
  if (!fileKey) return avatarUrl;

  // Refresh only when fully expired
  if (isSignedUrlExpired(avatarUrl)) {
    return await getSignedUrlForAsset(fileKey);
  }

  return avatarUrl;
};


export const parseAwsDate = (awsDate: string): Date => {
  // Example: 20251106T080914Z → "2025-11-06T08:09:14Z"
  const year = awsDate.substring(0, 4);
  const month = awsDate.substring(4, 6);
  const day = awsDate.substring(6, 8);
  const hour = awsDate.substring(9, 11);
  const min = awsDate.substring(11, 13);
  const sec = awsDate.substring(13, 15);
  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
};
