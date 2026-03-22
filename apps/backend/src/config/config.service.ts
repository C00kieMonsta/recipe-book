import { Injectable } from "@nestjs/common";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  AWS_REGION: z.string().default("eu-west-1"),
  INGREDIENTS_TABLE: z.string().min(1),
  RECIPES_TABLE: z.string().min(1),
  DDB_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(1),
  ADMIN_CREDENTIALS: z.string().min(1),
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof schema>;

@Injectable()
export class ConfigService {
  private readonly env: Env;

  constructor() {
    this.env = schema.parse(process.env);
  }

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }

  get tables() {
    return {
      ingredients: this.env.INGREDIENTS_TABLE,
      recipes: this.env.RECIPES_TABLE,
    };
  }
}
