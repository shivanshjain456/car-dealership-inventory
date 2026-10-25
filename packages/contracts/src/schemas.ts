import { z } from 'zod';
import { isCurrencyCode, toMinorUnits } from './money.js';

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());
const passwordSchema = z.string().min(12).max(128);
const vehicleTextSchema = z.string().trim().min(1).max(80);
const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, 'Use a supported ISO 4217 currency code.');

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema
  })
  .strict();

export const moneyInputSchema = z
  .object({
    amount: z.string().min(1).max(30),
    currency: currencyCodeSchema
  })
  .strict()
  .superRefine((money, context) => {
    if (!isCurrencyCode(money.currency)) return;

    try {
      toMinorUnits(money.amount, money.currency);
    } catch (error) {
      context.addIssue({
        code: 'custom',
        path: ['amount'],
        message: error instanceof Error ? error.message : 'Amount is invalid for this currency.'
      });
    }
  });

export const vehicleInputSchema = z
  .object({
    make: vehicleTextSchema,
    model: vehicleTextSchema,
    category: vehicleTextSchema,
    price: moneyInputSchema,
    quantity: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
  })
  .strict();

export const restockSchema = z
  .object({
    quantity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
  })
  .strict();

const optionalSearchText = z
  .string()
  .trim()
  .max(80)
  .transform((value) => value || undefined)
  .optional();
const optionalPriceBound = z
  .string()
  .trim()
  .max(30)
  .transform((value) => value || undefined)
  .optional();

function addPriceIssue(
  context: z.RefinementCtx,
  field: 'minPrice' | 'maxPrice',
  error: unknown
): void {
  context.addIssue({
    code: 'custom',
    path: [field],
    message: error instanceof Error ? error.message : 'Price bound is invalid for this currency.'
  });
}

export const searchQuerySchema = z
  .object({
    q: optionalSearchText,
    make: optionalSearchText,
    model: optionalSearchText,
    category: optionalSearchText,
    minPrice: optionalPriceBound,
    maxPrice: optionalPriceBound,
    currency: currencyCodeSchema.optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict()
  .superRefine((query, context) => {
    const hasMin = query.minPrice !== undefined;
    const hasMax = query.maxPrice !== undefined;
    if ((hasMin || hasMax) && !query.currency) {
      context.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'A currency is required when filtering by price.'
      });
      return;
    }

    if (!query.currency || !isCurrencyCode(query.currency)) return;

    let minMinor: number | undefined;
    let maxMinor: number | undefined;
    if (hasMin) {
      try {
        minMinor = toMinorUnits(query.minPrice!, query.currency);
      } catch (error) {
        addPriceIssue(context, 'minPrice', error);
      }
    }
    if (hasMax) {
      try {
        maxMinor = toMinorUnits(query.maxPrice!, query.currency);
      } catch (error) {
        addPriceIssue(context, 'maxPrice', error);
      }
    }

    if (minMinor !== undefined && maxMinor !== undefined && minMinor > maxMinor) {
      context.addIssue({
        code: 'custom',
        path: ['maxPrice'],
        message: 'Maximum price must be greater than or equal to minimum price.'
      });
    }
  });

export const userRoleSchema = z.enum(['customer', 'admin']);

export const userDtoSchema = z
  .object({
    id: z.string().uuid(),
    email: emailSchema,
    role: userRoleSchema,
    createdAt: z.string().datetime()
  })
  .strict();

export const vehicleDtoSchema = z
  .object({
    id: z.string().uuid(),
    make: vehicleTextSchema,
    model: vehicleTextSchema,
    category: vehicleTextSchema,
    price: moneyInputSchema,
    quantity: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const vehiclePageSchema = z
  .object({
    items: z.array(vehicleDtoSchema),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0)
  })
  .strict();

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        fields: z.array(z.object({ field: z.string(), message: z.string() }).strict()).optional()
      })
      .strict(),
    requestId: z.string().uuid()
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MoneyInput = z.infer<typeof moneyInputSchema>;
export type VehicleInput = z.infer<typeof vehicleInputSchema>;
export type RestockInput = z.infer<typeof restockSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type UserDto = z.infer<typeof userDtoSchema>;
export type VehicleDto = z.infer<typeof vehicleDtoSchema>;
export type VehiclePage = z.infer<typeof vehiclePageSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
