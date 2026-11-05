import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

export async function getUploadUrl(key: string, contentType: string, expiresIn = 300) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

export async function getDownloadUrl(key: string, expiresIn = 3600) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn }
  );
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function createMultipartUpload(key: string, contentType: string) {
  const res = await r2.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }));
  return res.UploadId!;
}

export async function getPartUploadUrl(key: string, uploadId: string, partNumber: number, expiresIn = 3600) {
  return getSignedUrl(
    r2,
    new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn }
  );
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: { ETag: string; PartNumber: number }[]) {
  await r2.send(new CompleteMultipartUploadCommand({
    Bucket: BUCKET, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }));
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  await r2.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }));
}
