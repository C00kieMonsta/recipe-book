import { Injectable } from "@nestjs/common";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  AWS_REGION: z.string().default("eu-west-1"),
  INGREDIENTS_TABLE: z.string().min(1),
  RECIPES_TABLE: z.string().min(1),
  SETTINGS_TABLE: z.string().min(1),
  EVENTS_TABLE: z.string().min(1),
  GROCERY_LISTS_TABLE: z.string().min(1),
  CLIENTS_TABLE: z.string().min(1).optional(),
  LEDGER_TABLE: z.string().min(1).optional(),
  DDB_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(1),
  ADMIN_CREDENTIALS: z.string().min(1),
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof schema>;

export type Tables = {
  ingredients: string;
  recipes: string;
  settings: string;
  events: string;
  groceryLists: string;
  clients?: string;
  ledger?: string;
};

@Injectable()
export class ConfigService {
  private readonly env: Env;

  constructor() {
    this.env = schema.parse(process.env);
  }

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }

  get tables(): Tables {
    return {
      ingredients: this.env.INGREDIENTS_TABLE,
      recipes: this.env.RECIPES_TABLE,
      settings: this.env.SETTINGS_TABLE,
      events: this.env.EVENTS_TABLE,
      groceryLists: this.env.GROCERY_LISTS_TABLE,
      clients: this.env.CLIENTS_TABLE,
      ledger: this.env.LEDGER_TABLE,
    };
  }
}
