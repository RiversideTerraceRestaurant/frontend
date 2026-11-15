import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Loader2, Search, Users } from "lucide-react";
import { useBookingCopy } from "@/content/bookingCopy";
import { MAX_ONLINE_GUESTS, normaliseSearch, restaurantNow, slotsOn } from "@/lib/bookingSlots";
import { cn } from "@/lib/utils";

export interface BookingSearchValue { date: string; time: string; guests: number }

/** Date / time / guests picker with a "Find a table" button. */
export function BookingSearch({
  value, onSubmit, variant = "page", busy = false, className,
}: {
  value?: Partial<BookingSearchValue>;
  onSubmit: (value: BookingSearchValue) => void;
  variant?: "hero" | "page";
  busy?: boolean;
  className?: string;
}) {
  const { t } = useBookingCopy();
  const today = restaurantNow().date;
  const initial = useMemo(() => normaliseSearch(value?.date, value?.time), [value?.date, value?.time]);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [guests, setGuests] = useState(Math.min(Math.max(value?.guests || 2, 1), MAX_ONLINE_GUESTS));
  useEffect(() => { setDate(initial.date); setTime(initial.time); }, [initial]);
  useEffect(() => { if (value?.guests) setGuests(Math.min(Math.max(value.guests, 1), MAX_ONLINE_GUESTS)); }, [value?.guests]);
  const slots = slotsOn(date);
  // Keep the time valid when the date changes (today drops past slots).
  useEffect(() => { if (slots.length && !slots.includes(time)) setTime(normaliseSearch(date, time).time); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const hero = variant === "hero";
  const field = cn(
    "flex min-w-0 items-center gap-2 rounded-2xl px-3",
    hero ? "h-14 bg-white/95 text-[#2b1d17] shadow-sm" : "h-12 border border-[#e6d6c2] bg-white text-[#2b1d17]",
  );
  const label = "sr-only";
  return (
    <form
      onSubmit={(event) => { event.preventDefault(); onSubmit({ date, time, guests }); }}
      className={cn("grid gap-2", hero ? "grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr_auto]" : "grid-cols-2 md:grid-cols-[1.3fr_1fr_1fr_auto]", className)}
    >
      <label className={cn(field, "col-span-2 sm:col-span-1")}>
        <CalendarDays className="h-4 w-4 shrink-0 text-[#b5452f]" />
        <span className={label}>{t("searchDate")}</span>
        <input type="date" required min={today} value={date} onChange={(event) => setDate(event.target.value || today)} className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none" />
      </label>
      <label className={field}>
        <Clock3 className="h-4 w-4 shrink-0 text-[#b5452f]" />
        <span className={label}>{t("searchTime")}</span>
        <select value={time} onChange={(event) => setTime(event.target.value)} className="min-w-0 flex-1 cursor-pointer bg-transparent text-[15px] font-medium outline-none">
          {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
        </select>
      </label>
      <label className={field}>
        <Users className="h-4 w-4 shrink-0 text-[#b5452f]" />
        <span className={label}>{t("searchGuests")}</span>
        <select value={guests} onChange={(event) => setGuests(Number(event.target.value))} className="min-w-0 flex-1 cursor-pointer bg-transparent text-[15px] font-medium outline-none">
          {Array.from({ length: MAX_ONLINE_GUESTS }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {t("bookingGuestLabel")}</option>)}
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className={cn(
          "col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-[#c0392b] px-6 font-semibold text-white shadow-lg shadow-[#c0392b]/30 transition hover:bg-[#a93226] active:scale-[0.98] disabled:opacity-70 sm:col-span-1",
          hero ? "h-14 text-base" : "h-12 md:col-span-1",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
        {t("findTable")}
      </button>
    </form>
  );
}
