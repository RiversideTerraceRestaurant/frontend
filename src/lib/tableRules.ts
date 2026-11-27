import type { Booking, RestaurantArea, RestaurantTable } from "@/types/booking";

/**
 * Table-joining rules shared by the guest booking page and the admin dialog.
 * Mirrors ReservationRules.java on the backend, which has the final say.
 */
export const MAX_JOINED_TABLES = 3;
export const MAX_JOINED_SEATS = 6;

/** Last table number of each area's first column; tables can only be joined within one column. */
export const FIRST_COLUMN_LAST: Record<RestaurantArea, number> = { TERRACE: 6, ROMA: 6, VERONA: 10, SORRENTO: 4 };
const VERONA_PAIRS = [[11, 12], [13, 14], [15, 16]];

/** Physical terrace furniture: the terrace splits into at most 4 four-seat and 4 two-seat tables at a time. */
export const TERRACE_FOUR_TOPS = 4;
export const TERRACE_TWO_TOPS = 4;

/** Copy keys (bookingCopy) explaining why a selection is not allowed. */
export type RuleError =
  | "bookingGuestInvalid"
  | "bookingLargeParty"
  | "bookingMaxTables"
  | "bookingMaxCapacity"
  | "bookingAdjacentOnly"
  | "bookingSameColumnOnly"
  | "bookingVeronaPairs"
  | "bookingVeronaMinimum"
  | "bookingOneTableForTwo"
  | "bookingTooManyTables"
  | "bookingCapacityTooSmall"
  | "bookingTerraceFull";

export const tableNumber = (table: Pick<RestaurantTable, "tableNumber">) => Number(table.tableNumber.replace(/\D/g, "")) || Number.MAX_SAFE_INTEGER;
export const columnOf = (area: RestaurantArea, number: number) => (number <= FIRST_COLUMN_LAST[area] ? 0 : 1);
const seats = (tables: RestaurantTable[]) => tables.reduce((sum, table) => sum + table.capacity, 0);
const sortByNumber = (tables: RestaurantTable[]) => [...tables].sort((a, b) => tableNumber(a) - tableNumber(b));

/** Fewest terrace places (2 seats each) that seat the party. */
export const terraceTablesFor = (guests: number) => Math.max(1, Math.min(MAX_JOINED_TABLES, Math.ceil(guests / 2)));

/** True when the group would still seat everyone without one of its end tables. */
function hasSpareTable(tables: RestaurantTable[], guests: number) {
  if (tables.length < 2) return false;
  const sorted = sortByNumber(tables);
  const total = seats(sorted);
  return total - sorted[0].capacity >= guests || total - sorted[sorted.length - 1].capacity >= guests;
}

/** Shape rules that hold for any partial selection: adjacency, column, size, Verona pairs. */
function shapeError(area: RestaurantArea, tables: RestaurantTable[]): RuleError | null {
  if (tables.length > MAX_JOINED_TABLES) return "bookingMaxTables";
  if (seats(tables) > MAX_JOINED_SEATS) return "bookingMaxCapacity";
  const numbers = sortByNumber(tables).map(tableNumber);
  if (numbers.some((number, index) => index > 0 && number !== numbers[index - 1] + 1)) return "bookingAdjacentOnly";
  if (new Set(numbers.map((number) => columnOf(area, number))).size > 1) return "bookingSameColumnOnly";
  if (area === "VERONA" && numbers.some((number) => number >= 11) && !VERONA_PAIRS.some((pair) => numbers.every((number) => pair.includes(number)))) return "bookingVeronaPairs";
  return null;
}

/** Full check before submitting; null when the tables are valid for this party. */
export function selectionError(area: RestaurantArea, tables: RestaurantTable[], guests: number): RuleError | null {
  if (!Number.isInteger(guests) || guests < 1) return "bookingGuestInvalid";
  if (guests > MAX_JOINED_SEATS) return "bookingLargeParty";
  if (area === "VERONA" && guests <= 2) return "bookingVeronaMinimum";
  const shape = shapeError(area, tables);
  if (shape) return shape;
  if (guests <= 2 && tables.length > 1) return "bookingOneTableForTwo";
  if (seats(tables) < guests) return "bookingCapacityTooSmall";
  if (hasSpareTable(tables, guests)) return "bookingTooManyTables";
  if (area === "VERONA" && tables.some((table) => tableNumber(table) >= 11) && tables.length !== 2) return "bookingVeronaPairs";
  return null;
}

/**
 * Why `table` cannot be added to the current selection for this party (null = it can).
 * Adding is blocked once the chosen tables already seat everyone: change the party size first.
 */
export function addError(area: RestaurantArea, selected: RestaurantTable[], table: RestaurantTable, guests: number): RuleError | null {
  if (guests > MAX_JOINED_SEATS) return "bookingLargeParty";
  if (area === "VERONA" && guests <= 2) return "bookingVeronaMinimum";
  if (selected.length && seats(selected) >= guests) return guests <= 2 ? "bookingOneTableForTwo" : "bookingTooManyTables";
  const next = [...selected, table];
  const shape = shapeError(area, next);
  if (shape) return shape;
  if (hasSpareTable(next, guests)) return "bookingTooManyTables";
  return null;
}

/** Whether `table` can start a valid group for this party with its free neighbours in the same column. */
export function canSeatFrom(area: RestaurantArea, table: RestaurantTable, free: RestaurantTable[], guests: number) {
  const byNumber = new Map(free.map((item) => [tableNumber(item), item]));
  const number = tableNumber(table);
  for (let size = 1; size <= MAX_JOINED_TABLES; size++) {
    for (let start = number - size + 1; start <= number; start++) {
      const group: RestaurantTable[] = [];
      for (let offset = 0; offset < size; offset++) {
        const item = byNumber.get(start + offset);
        if (item) group.push(item);
      }
      if (group.length === size && !selectionError(area, group, guests)) return true;
    }
  }
  return false;
}

// ---------------- terrace split limit ----------------

/** Whether every party (in joined places) gets physical tables: 1 → a 2- or 4-top; 2 → 4 or 2+2; 3 → 4+2, 2+2+2 or 4+4. */
export function terraceFurnitureFits(parties: number[]) {
  let reach = new Set(["0,0"]);
  for (const places of parties) {
    const next = new Set<string>();
    for (const key of reach) {
      const [fours, twos] = key.split(",").map(Number);
      for (let useFours = 0; fours + useFours <= TERRACE_FOUR_TOPS; useFours++) {
        for (let useTwos = 0; twos + useTwos <= TERRACE_TWO_TOPS; useTwos++) {
          const total = useFours * 4 + useTwos * 2;
          const minimal = total >= places * 2 && (useFours === 0 || total - 4 < places * 2) && (useTwos === 0 || total - 2 < places * 2);
          if (minimal) next.add(`${fours + useFours},${twos + useTwos}`);
        }
      }
    }
    if (!next.size) return false;
    reach = next;
  }
  return true;
}

const hm = (time: string) => time.slice(0, 5);

/** Whether one more terrace party of `places` fits alongside the active terrace bookings throughout [start, end). */
export function terraceSplitAllowed(bookings: Booking[], start: string, end: string, places: number, ignoreId?: number) {
  const others = bookings.filter((booking) => booking.id !== ignoreId && booking.area === "TERRACE" && ["PENDING", "APPROVED"].includes(booking.status) && booking.tables.length);
  const points = [hm(start), ...others.map((booking) => hm(booking.startTime)).filter((time) => time > hm(start) && time < hm(end))];
  return points.every((point) => terraceFurnitureFits([
    places,
    ...others.filter((booking) => hm(booking.startTime) <= point && hm(booking.endTime) > point).map((booking) => booking.tables.length),
  ]));
}
