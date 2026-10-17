import { Injectable } from "@nestjs/common";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfigService } from "../config/config.service";

const PRESIGN_EXPIRES = 3600;

export type PresignOptions = { filename?: string; inline?: boolean; expiresIn?: number };

export type S3ObjectSummary = { key: string; size: number; lastModified?: Date };

export type S3ObjectStream = { body: AsyncIterable<Uint8Array>; contentType: string; contentLength?: number; lastModified?: Date };

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private config: ConfigService) {
    this.client = new S3Client({ region: config.get("AWS_REGION") });
    this.bucket = config.get("S3_BUCKET");
  }

  async upload(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(metadata && { Metadata: metadata }),
    }));
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string; metadata?: Record<string, string> }> {
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    const body = Buffer.from(await res.Body!.transformToByteArray());
    return { body, contentType: res.ContentType ?? "application/octet-stream", metadata: res.Metadata };
  }

  // The body as chunks, for copying an object somewhere without holding it whole.
  async stream(key: string): Promise<S3ObjectStream> {
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    return {
      body: res.Body as unknown as AsyncIterable<Uint8Array>,
      contentType: res.ContentType ?? "application/octet-stream",
      contentLength: res.ContentLength,
      lastModified: res.LastModified,
    };
  }

  // Every key in the bucket, a thousand per page. Needs s3:ListBucket on the bucket itself.
  async listAll(): Promise<S3ObjectSummary[]> {
    const objects: S3ObjectSummary[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: cursor }));
      for (const object of res.Contents ?? []) {
        if (object.Key) objects.push({ key: object.Key, size: object.Size ?? 0, lastModified: object.LastModified });
      }
      cursor = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (cursor);
    return objects;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  // With a filename the browser opens the object inline under that name (or downloads it when inline is false).
  async presignedUrl(key: string, opts: PresignOptions = {}): Promise<string> {
    const disposition = opts.filename
      ? `${opts.inline === false ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`
      : undefined;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(disposition && { ResponseContentDisposition: disposition }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getSignedUrl(this.client as any, command as any, { expiresIn: opts.expiresIn ?? PRESIGN_EXPIRES });
  }
}
