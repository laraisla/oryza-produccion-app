import type { Database } from '@/data/model';
import type { ServiceContext } from '@/data/services/context';

let counter = 0;

export function ctxFor(db: Database, userId: string, today = '2026-10-16'): ServiceContext {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error(`usuario ${userId} inexistente`);
  return {
    user,
    now: () => `${today}T12:00:00.000Z`,
    today: () => today,
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  };
}
