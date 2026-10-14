import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { AppSettings, BrandKind } from "@packages/types";
import { BRAND_IMAGE_TYPES, BRAND_KINDS, MAX_BRAND_IMAGE_BYTES, updateSettingsRequestSchema } from "@packages/types";
import { AdminGuard } from "../auth/admin.guard";
import { S3Service } from "../shared/s3.service";
import { SettingsService, brandKeyField } from "./settings.service";

// The multer fields the brand upload reads; the extension comes from the mimetype, never from the file name.
export type BrandUpload = { mimetype: string; buffer: Buffer };

const BRAND_MISSING = "Image manquante ou format non pris en charge (JPEG ou PNG)";

export const brandFileFilter = (_req: unknown, f: { mimetype: string }, cb: (err: Error | null, accept: boolean) => void) =>
  cb(null, Object.hasOwn(BRAND_IMAGE_TYPES, f.mimetype));

const isMissingObject = (err: unknown): boolean => {
  const name = (err as { name?: string } | null)?.name;
  return name === "NoSuchKey" || name === "NotFound";
};

function parseKind(kind: string): BrandKind {
  if (!(BRAND_KINDS as string[]).includes(kind)) throw new BadRequestException("Image inconnue (logo ou banner)");
  return kind as BrandKind;
}

@UseGuards(AdminGuard)
@Controller("admin/settings")
export class SettingsController {
  constructor(private settings: SettingsService, private s3: S3Service) {}

  @Get()
  async get() {
    return this.settings.get();
  }

  @Patch()
  async update(@Body() body: unknown) {
    const parsed = updateSettingsRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.settings.update(parsed.data);
  }

  // A file over the size limit surfaces as 413 through Nest's multer mapping.
  @Post("brand/:kind")
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: MAX_BRAND_IMAGE_BYTES, files: 1 },
    fileFilter: brandFileFilter,
  }))
  async uploadBrand(@Param("kind") kindParam: string, @UploadedFile() file?: BrandUpload): Promise<AppSettings> {
    const kind = parseKind(kindParam);
    const ext = file ? BRAND_IMAGE_TYPES[file.mimetype] : undefined;
    if (!file || ext === undefined) throw new BadRequestException(BRAND_MISSING);
    const field = brandKeyField(kind);
    const previous = (await this.settings.get())[field];
    const key = `brand/${kind}.${ext}`;
    await this.s3.upload(key, file.buffer, file.mimetype);
    const settings = await this.settings.update({ [field]: key });
    if (previous && previous !== key) await this.deleteObject(previous);
    return settings;
  }

  @Delete("brand/:kind")
  async removeBrand(@Param("kind") kindParam: string): Promise<AppSettings> {
    const kind = parseKind(kindParam);
    const current = (await this.settings.get())[brandKeyField(kind)];
    if (current) await this.deleteObject(current);
    return this.settings.removeBrandKey(kind);
  }

  @Get("brand/:kind")
  async getBrand(@Param("kind") kindParam: string, @Res() res: Response): Promise<void> {
    const kind = parseKind(kindParam);
    const key = (await this.settings.get())[brandKeyField(kind)];
    if (!key) throw new NotFoundException("Image absente");
    try {
      const { body, contentType } = await this.s3.get(key);
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "private, max-age=86400");
      res.send(body);
    } catch (err) {
      if (isMissingObject(err)) throw new NotFoundException("Image absente");
      throw err;
    }
  }

  // Best-effort: a missing object must not block the settings write.
  private async deleteObject(key: string): Promise<void> {
    try {
      await this.s3.delete(key);
    } catch (err) {
      console.warn(JSON.stringify({ action: "deleteBrandObject", key, error: String(err) }));
    }
  }
}
