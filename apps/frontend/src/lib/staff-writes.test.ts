import { hoursBetween, upsertStaffEntry } from "@packages/types";
import { StaffWriteQueue } from "./staff-writes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("StaffWriteQueue", () => {
  it("serializes delayed start and end edits while deriving the second from the latest optimistic entry", async () => {
    const firstResponse = deferred<{ staff: typeof sent[number] }>();
    const firstStarted = deferred<void>();
    const sent: { personId: string; startTime?: string; endTime?: string; hours?: number; hourlyRate?: number }[][] = [];
    const queue = new StaffWriteQueue();
    const write = (staff: typeof sent[number]) => {
      sent.push(staff.map((entry) => ({ ...entry })));
      if (sent.length === 1) firstStarted.resolve(undefined);
      return sent.length === 1 ? firstResponse.promise : Promise.resolve({ staff });
    };

    const first = queue.update((staff) => upsertStaffEntry(staff, "person-1", { startTime: "18:00" }), write, (result) => result.staff);
    await firstStarted.promise;
    expect(sent).toEqual([[{ personId: "person-1", startTime: "18:00" }]]);
    const second = queue.update((staff) => {
      const current = staff.find((entry) => entry.personId === "person-1");
      const endTime = "24:00";
      const hours = hoursBetween(current?.startTime, endTime);
      return upsertStaffEntry(staff, "person-1", { endTime, ...(hours === undefined ? {} : { hours }) });
    }, write, (result) => result.staff);

    expect(queue.current).toEqual([{ personId: "person-1", startTime: "18:00", endTime: "24:00", hours: 6 }]);

    firstResponse.resolve({ staff: [{ personId: "person-1", startTime: "18:00", hourlyRate: 18 }] });
    await Promise.all([first, second]);
    expect(sent).toEqual([
      [{ personId: "person-1", startTime: "18:00" }],
      [{ personId: "person-1", startTime: "18:00", endTime: "24:00", hours: 6, hourlyRate: 18 }],
    ]);
    expect(queue.current[0].hourlyRate).toBe(18);

    await queue.update(
      (staff) => upsertStaffEntry(staff, "person-1", { hours: 7.5, startTime: undefined, endTime: undefined }),
      async (staff) => {
        sent.push(staff.map((entry) => ({ ...entry })));
        return { staff };
      },
      (result) => result.staff,
    );
    expect(queue.current).toEqual([{ personId: "person-1", hours: 7.5, hourlyRate: 18 }]);
    expect(sent[2]).toEqual([{ personId: "person-1", hours: 7.5, hourlyRate: 18 }]);
  });
});
