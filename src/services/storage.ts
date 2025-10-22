import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  // Note: forcePathStyle is not needed for AWS S3 (it's the default)
});

export const uploadFile = async (file: Buffer, key: string, contentType: string) => {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
    Body: file,
    ContentType: contentType,
  });
  
  return await s3Client.send(command);
};

// Specific function for uploading public files (like logos)
export const uploadPublicFile = async (file: Buffer, key: string, contentType: string) => {
  const uploadCommand = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
    Body: file,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000', // Cache for 1 year
    // Note: ACL removed - bucket doesn't support ACLs, using bucket policy instead
    Metadata: {
      'upload-purpose': 'public-asset',
      'upload-timestamp': Date.now().toString(),
    },
  });
  
  await s3Client.send(uploadCommand);
  return { success: true };
};

export const getFileUrl = async (key: string, expiresIn: number = 3600) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
  });
  
  return await getSignedUrl(s3Client, command, { expiresIn });
};

export const getPublicFileUrl = async (key: string) => {
  // Since bucket doesn't support ACLs, use signed URLs for public access
  return await getSignedUrlForAsset(key);
};

// Generate a signed URL for assets (like logos) - expires in 7 days
export const getSignedUrlForAsset = async (key: string) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
  });
  
  // Maximum allowed: 7 days (604800 seconds)
  const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds
  return await getSignedUrl(s3Client, command, { expiresIn });
};

// Check if a URL is a signed URL (contains X-Amz-Signature)
export const isSignedUrl = (url: string): boolean => {
  return url.includes('X-Amz-Signature') || url.includes('X-Amz-Credential');
};

// Extract file key from a signed URL or return the URL as-is
export const extractFileKeyFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    if (pathParts.length >= 3) {
      // Extract key from path like /bucket-name/logos/filename
      return pathParts.slice(2).join('/');
    }
  } catch (error) {
    console.error('Error parsing URL:', error);
  }
  return null;
};

// Refresh a signed URL if it's expired or about to expire
export const refreshSignedUrl = async (url: string): Promise<string> => {
  // If it's not a signed URL, return as-is
  if (!isSignedUrl(url)) {
    return url;
  }
  
  // Extract the file key from the URL
  const fileKey = extractFileKeyFromUrl(url);
  if (!fileKey) {
    return url;
  }
  
  // Generate a new signed URL
  return await getSignedUrlForAsset(fileKey);
};

export const deleteFile = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
  });
  
  return await s3Client.send(command);
};
