import { z } from 'zod';
import type { Knex } from 'knex';

export const isKnexInstance = (val: unknown): val is Knex => {
  return (
    typeof val === 'function' &&
    typeof (val as any).raw === 'function' &&
    typeof (val as any).client === 'object' &&
    (val as any).client !== null
  );
};

export const dbConnectionSchema = z.custom<Knex>(isKnexInstance, {
  message: 'Invalid dbConnection (Knex instance expected)',
});

// // Re-export the type for convenience
// export type { Knex } from 'knex';
