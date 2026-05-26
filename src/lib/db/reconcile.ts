// src/lib/db/reconcile.ts
//
// One-shot data reconciliation. Runs at server startup (from
// instrumentation.ts) to fix any rows whose cached handicapIndexValue
// disagrees with the canonical handicapIndex string — most often plus
// handicaps that were stored before the parser was sign-aware.

import { eq } from 'drizzle-orm';
import { db, golfers } from './index';
import { parseHandicapIndex } from '@/lib/utils/format';

export async function reconcileHandicapIndexValues(): Promise<number> {
  const rows = await db
    .select({
      id: golfers.id,
      handicapIndex: golfers.handicapIndex,
      handicapIndexValue: golfers.handicapIndexValue,
      fullName: golfers.fullName,
    })
    .from(golfers);

  let fixed = 0;
  for (const g of rows) {
    const parsed = parseHandicapIndex(g.handicapIndex);
    if (!Number.isFinite(parsed)) continue;
    const a = Math.round(parsed * 10) / 10;
    const b = Math.round(g.handicapIndexValue * 10) / 10;
    if (a === b) continue;
    await db
      .update(golfers)
      .set({ handicapIndexValue: parsed })
      .where(eq(golfers.id, g.id));
    // eslint-disable-next-line no-console
    console.log(
      `[reconcile] ${g.fullName}: ${b.toFixed(1)} -> ${a.toFixed(1)} (index "${g.handicapIndex}")`,
    );
    fixed++;
  }
  if (fixed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[reconcile] Updated ${fixed} cached handicap value(s).`);
  }
  return fixed;
}
