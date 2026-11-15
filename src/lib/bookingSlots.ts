// Bookable start times, in restaurant (Da Nang) time so guests abroad see the right day.
// Keep in sync with backend/src/booking-assistant.js.
export const RESTAURANT_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const FIRST_SLOT = "11:00";
export const LAST_SLOT = "21:30";
export const DEFAULT_TIME = "19:00";
export const DURATION_MINUTES = 120;
export const MAX_ONLINE_GUESTS = 6;

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const START_SLOTS: string[] = [];
for (let minutes = toMinutes(FIRST_SLOT); minutes <= toMinutes(LAST_SLOT); minutes += 30) START_SLOTS.push(toTime(minutes));

/** End-time choices for a start: 1 to 4 hours later, never past 23:30. */
export function endSlotsFor(start: string) {
  const slots: string[] = [];
  for (let minutes = toMinutes(start) + 60; minutes <= Math.min(toMinutes(start) + 240, 23 * 60 + 30); minutes += 30) slots.push(toTime(minutes));
  return slots;
}
export const defaultEndFor = (start: string) => toTime(Math.min(toMinutes(start) + DURATION_MINUTES, 23 * 60 + 30));

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Current date and time at the restaurant. */
export function restaurantNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: RESTAURANT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Start slots still open on `date` (today drops slots that have started). */
export function slotsOn(date: string, now = restaurantNow()) {
  if (date > now.date) return START_SLOTS;
  if (date < now.date) return [];
  return START_SLOTS.filter((slot) => slot > now.time);
}

/** Earliest sensible search: tonight at 19:00 if possible, otherwise the next open slot or tomorrow. */
export function defaultSearch(now = restaurantNow()) {
  const today = slotsOn(now.date, now);
  if (today.length) return { date: now.date, time: today.includes(DEFAULT_TIME) ? DEFAULT_TIME : today[0] };
  return { date: addDays(now.date, 1), time: DEFAULT_TIME };
}

/** Makes a date/time pair bookable, moving it forward when it is in the past. */
export function normaliseSearch(date: string | null | undefined, time: string | null | undefined, now = restaurantNow()) {
  const fallback = defaultSearch(now);
  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= now.date ? date : fallback.date;
  const slots = slotsOn(validDate, now);
  if (!slots.length) return fallback;
  const wanted = time && START_SLOTS.includes(time) ? time : DEFAULT_TIME;
  return { date: validDate, time: slots.includes(wanted) ? wanted : slots.find((slot) => slot >= wanted) ?? slots[0] };
}
