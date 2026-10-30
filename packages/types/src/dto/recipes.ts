import { z } from "zod";
import { UNITS_QTY } from "../entities/recipe";

const recipeIngredientSchema = z.object({
  ingredientId: z.string().min(1),
  qty: z.number().nonnegative(),
  unit: z.enum(UNITS_QTY),
  lossPct: z.number().min(0).max(100).default(0),
});

const recipePricingSchema = z.object({
  surPlace: z.object({ coef: z.number().positive(), tva: z.number().nonnegative() }),
  takeAway: z.object({ coef: z.number().positive(), tva: z.number().nonnegative() }),
  chosenPrice: z.object({ surPlace: z.number().nonnegative(), takeAway: z.number().nonnegative() }),
});

const recipePhotoSchema = z.object({
  key: z.string().min(1),
  label: z.string().default(""),
  url: z.string().optional(),
});

export const recipePreparationSchema = z.object({
  preparationId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  daysBefore: z.number().int().min(0).max(60).default(0),
  description: z.string().trim().max(500).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  resource: z.enum(["bench", "oven", "stove"]).optional(),
  dependsOn: z.array(z.string().min(1)).max(50).optional(),
  ingredientShares: z
    .record(z.string(), z.number().finite().min(0).max(100))
    .optional(),
});

const preparationsSchema = z
  .array(recipePreparationSchema)
  .max(50)
  .superRefine((parts, ctx) => {
    const byId = new Map(parts.map((p) => [p.preparationId, p]));
    if (byId.size !== parts.length)
      ctx.addIssue({
        code: "custom",
        message: "Identifiants de préparation en double.",
      });
    const visited = new Set<string>();
    const visit = (id: string, path: Set<string>): boolean => {
      if (path.has(id)) return false;
      if (visited.has(id)) return true;
      const valid = (byId.get(id)?.dependsOn ?? []).every(
        (dep) => byId.has(dep) && visit(dep, new Set([...path, id])),
      );
      if (valid) visited.add(id);
      return valid;
    };
    for (const p of parts)
      if (!visit(p.preparationId, new Set())) {
        ctx.addIssue({
          code: "custom",
          message: "Dépendance manquante ou circulaire.",
        });
        break;
      }
    const sums = new Map<string, number>();
    for (const p of parts)
      for (const [id, share] of Object.entries(p.ingredientShares ?? {}))
        sums.set(id, (sums.get(id) ?? 0) + share);
    if ([...sums.values()].some((sum) => sum > 100.001))
      ctx.addIssue({
        code: "custom",
        message: "La répartition d'un ingrédient dépasse 100 %.",
      });
  });

export const createRecipeRequestSchema = z.object({
  name: z.string().min(1).trim(),
  category: z.string().trim().min(1).max(40).optional(),
  // Keeps its default so old importers pass; the service mirrors category into it.
  type: z.string().default("Buffet"),
  portions: z.number().int().positive().default(1),
  portionWeight: z.number().nonnegative().default(150),
  defaultCourse: z.string().trim().optional(),
  description: z.string().trim().optional(),
  techniques: z.array(z.string()).default([]),
  preparations: preparationsSchema.default([]),
  ingredients: z.array(recipeIngredientSchema).default([]),
  photos: z.array(recipePhotoSchema).default([]),
  pricing: recipePricingSchema.default({
    surPlace: { coef: 4, tva: 12 },
    takeAway: { coef: 3, tva: 6 },
    chosenPrice: { surPlace: 0, takeAway: 0 },
  }),
});
export type CreateRecipeRequest = z.infer<typeof createRecipeRequestSchema>;

// Zod 4 applies defaults inside optional fields. PATCH must keep omitted fields absent.
export const updateRecipeRequestSchema = createRecipeRequestSchema.partial().extend({
  type: createRecipeRequestSchema.shape.type.removeDefault().optional(),
  portions: createRecipeRequestSchema.shape.portions.removeDefault().optional(),
  portionWeight: createRecipeRequestSchema.shape.portionWeight.removeDefault().optional(),
  techniques: createRecipeRequestSchema.shape.techniques.removeDefault().optional(),
  preparations: createRecipeRequestSchema.shape.preparations.removeDefault().optional(),
  ingredients: createRecipeRequestSchema.shape.ingredients.removeDefault().optional(),
  photos: createRecipeRequestSchema.shape.photos.removeDefault().optional(),
  pricing: createRecipeRequestSchema.shape.pricing.removeDefault().optional(),
});
export type UpdateRecipeRequest = z.infer<typeof updateRecipeRequestSchema>;

export const importRecipeIngredientSchema = z
  .object({
    name: z.string().min(1),
    qty: z.number().nonnegative(),
    unit: z.enum(UNITS_QTY).optional(),
  })
  .strip();
export type ImportRecipeIngredient = z.infer<typeof importRecipeIngredientSchema>;

export const listRecipesQuerySchema = z.object({
  q: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
});
export type ListRecipesQuery = z.infer<typeof listRecipesQuerySchema>;
