import { Injectable } from "@nestjs/common";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfigService } from "../config/config.service";

const PRESIGN_EXPIRES = 3600;

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private config: ConfigService) {
    this.client = new S3Client({ region: config.get("AWS_REGION") });
    this.bucket = config.get("S3_BUCKET");
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string }> {
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    const body = Buffer.from(await res.Body!.transformToByteArray());
    return { body, contentType: res.ContentType ?? "application/octet-stream" };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  async presignedUrl(key: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getSignedUrl(this.client as any, new GetObjectCommand({ Bucket: this.bucket, Key: key }) as any, { expiresIn: PRESIGN_EXPIRES });
  }
}
