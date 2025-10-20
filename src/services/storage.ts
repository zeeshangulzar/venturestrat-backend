import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.B2_REGION || 'us-east-005',
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for Backblaze B2
});

export const uploadFile = async (file: Buffer, key: string, contentType: string) => {
  const command = new PutObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME!,
    Key: key,
    Body: file,
    ContentType: contentType,
  });
  
  return await s3Client.send(command);
};

// Specific function for uploading public files (like logos)
export const uploadPublicFile = async (file: Buffer, key: string, contentType: string) => {
  // Upload file first
  const uploadCommand = new PutObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME!,
    Key: key,
    Body: file,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000', // Cache for 1 year
    Metadata: {
      'upload-purpose': 'public-asset',
      'upload-timestamp': Date.now().toString(),
    },
  });
  
  await s3Client.send(uploadCommand);
  
  // For Backblaze B2, we need to use the B2 native API to make the file public
  // Since we're using S3-compatible API, we'll return the upload result
  // The file will be accessible via the public URL if the bucket allows it
  return { success: true };
};

export const getFileUrl = async (key: string, expiresIn: number = 3600) => {
  const command = new GetObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME!,
    Key: key,
  });
  
  return await getSignedUrl(s3Client, command, { expiresIn });
};

export const getPublicFileUrl = (key: string) => {
  // For logos and other public files, use the direct public URL
  const bucketName = process.env.B2_BUCKET_NAME;
  
  if (!bucketName) {
    throw new Error('B2_BUCKET_NAME must be set');
  }
  
  // Backblaze B2 public URL format: https://f000.backblazeb2.com/file/bucket-name/key
  // Or use the friendly URL: https://bucket-name.s3.us-east-005.backblazeb2.com/key
  const friendlyUrl = `https://${bucketName}.s3.us-east-005.backblazeb2.com/${key}`;
  return friendlyUrl;
};

// Generate a signed URL for assets (like logos) - expires in 7 days
export const getSignedUrlForAsset = async (key: string) => {
  const command = new GetObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME!,
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
    Bucket: process.env.B2_BUCKET_NAME!,
    Key: key,
  });
  
  return await s3Client.send(command);
};
