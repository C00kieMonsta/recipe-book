import type { EventStaffEntry } from "@packages/types";

// Keeps edits based on the latest optimistic staff array and sends full-array writes in order.
export class StaffWriteQueue {
  private latest: EventStaffEntry[];
  private tail: Promise<void> = Promise.resolve();
  private pendingCountValue = 0;

  constructor(initial: EventStaffEntry[] = []) {
    this.latest = initial;
  }

  get current(): EventStaffEntry[] {
    return this.latest;
  }

  get pendingCount(): number {
    return this.pendingCountValue;
  }

  reset(staff: EventStaffEntry[]): void {
    this.latest = staff;
  }

  reconcile(staff: EventStaffEntry[]): boolean {
    if (this.pendingCountValue > 0) {
      const returnedById = new Map(staff.map((entry) => [entry.personId, entry]));
      this.latest = this.latest.map((entry) => {
        const returned = returnedById.get(entry.personId);
        if (!returned) return entry;
        return {
          ...entry,
          ...(entry.hourlyRate === undefined && returned.hourlyRate !== undefined ? { hourlyRate: returned.hourlyRate } : {}),
          ...(entry.kmRate === undefined && returned.kmRate !== undefined ? { kmRate: returned.kmRate } : {}),
        };
      });
      return false;
    }
    this.latest = staff;
    return true;
  }

  update<T>(
    transform: (staff: EventStaffEntry[]) => EventStaffEntry[],
    write: (staff: EventStaffEntry[]) => Promise<T>,
    returnedStaff?: (result: T) => EventStaffEntry[] | undefined,
  ): Promise<T> {
    this.latest = transform(this.latest);
    this.pendingCountValue += 1;
    const pending = this.tail.catch(() => undefined).then(() => write(this.latest.map((entry) => ({ ...entry }))));
    const reconciled = pending.then((result) => {
      this.pendingCountValue -= 1;
      const staff = returnedStaff?.(result);
      if (staff) this.reconcile(staff);
      return result;
    }, (error: unknown) => {
      this.pendingCountValue -= 1;
      throw error;
    });
    this.tail = reconciled.then(() => undefined, () => undefined);
    return reconciled;
  }
}
