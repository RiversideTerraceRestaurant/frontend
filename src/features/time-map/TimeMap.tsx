import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, FileSpreadsheet, ImageDown, Loader2, Plus, RefreshCw, StickyNote, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { AREAS, adminBookingApi } from "@/lib/bookingApi";
import { useBookingRealtime } from "@/hooks/use-booking-realtime";
import { addDays, restaurantNow } from "@/lib/bookingSlots";
import type { Booking, RestaurantArea, RestaurantTable } from "@/types/booking";
import { BookingDialog, StatusBadge, type BookingDraft } from "@/components/admin/BookingDialog";
import {
  CONFLICT_COLOR, STATUS_STYLE, VIEW_END, VIEW_SLOTS, VIEW_START, byTableNumber, conflictingIds, exportCsv, exportPng,
  hourLabel, isActive, rowRuns, span, toMinutes, toTime,
} from "./timeMapUtils";
import { cn } from "@/lib/utils";

const ROW_H = 52;
const LABEL_W = 76;

/** Admin time map: tables × 5–10pm for one day, with create/edit and exports. */
export default function TimeMap() {
  const { toast } = useToast();
  const [date, setDate] = useState(() => restaurantNow().date);
  const [area, setArea] = useState<RestaurantArea>("TERRACE");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [listTab, setListTab] = useState<"active" | "closed">("active");
  const [dialog, setDialog] = useState<{ booking: Booking | null; draft?: BookingDraft } | null>(null);
  const [now, setNow] = useState(() => restaurantNow());
  const gridRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const [day, allTables] = await Promise.all([adminBookingApi.bookings({ date }), tables.length ? Promise.resolve(tables) : adminBookingApi.tables()]);
      if (request !== requestRef.current) return;
      setBookings(day);
      setTables(allTables);
    } catch (error) {
      if (request === requestRef.current) toast({ title: "Cannot load the time map", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps -- tables only load once
  useEffect(() => { void load(); }, [load]);
  useBookingRealtime(() => { void load(); });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(restaurantNow()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => tables.filter((table) => table.area === area).sort(byTableNumber), [tables, area]);
  const active = useMemo(() => bookings.filter(isActive), [bookings]);
  const closed = useMemo(() => bookings.filter((booking) => !isActive(booking)), [bookings]);
  const conflicts = useMemo(() => conflictingIds(bookings), [bookings]);
  const areaBookings = active.filter((booking) => booking.area === area || booking.tables.some((table) => table.area === area));
  const outside = areaBookings.filter((booking) => !span(booking.startTime, booking.endTime).visible);
  const stats = {
    bookings: active.length,
    guests: active.reduce((sum, booking) => sum + booking.numberOfGuests, 0),
    pending: active.filter((booking) => booking.status === "PENDING").length,
  };
  const perArea = (value: RestaurantArea) => active.filter((booking) => booking.area === value).length;
  const isToday = date === now.date;
  const nowFraction = isToday ? span(now.time, now.time === VIEW_END ? VIEW_END : toTime(toMinutes(now.time) + 1)).left : -1;
  const showNow = isToday && toMinutes(now.time) >= toMinutes(VIEW_START) && toMinutes(now.time) <= toMinutes(VIEW_END);

  // Bring "now" into view on phones, where the grid scrolls sideways.
  useEffect(() => {
    const element = gridRef.current;
    if (!element || !showNow) return;
    element.scrollLeft = Math.max(0, nowFraction * (element.scrollWidth - LABEL_W) - 80);
  }, [date, showNow, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const createAt = (table: RestaurantTable, event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 0.999);
    const minutes = toMinutes(VIEW_START) + Math.floor((fraction * (toMinutes(VIEW_END) - toMinutes(VIEW_START))) / 30) * 30;
    setDialog({ booking: null, draft: { date, area, tableIds: [table.id], startTime: toTime(minutes) } });
  };

  const runExport = async (kind: "png-area" | "png-all" | "csv") => {
    setExporting(true);
    try {
      if (kind === "csv") exportCsv(date, bookings);
      else await exportPng(date, kind === "png-all" ? AREAS.map((item) => item.value) : [area], tables, bookings);
    } catch (error) {
      toast({ title: "Export failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const prettyDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const listed = (listTab === "active" ? active : closed).slice().sort((a, b) => a.startTime.localeCompare(b.startTime) || a.customerName.localeCompare(b.customerName));

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#faf5ec]">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-[#eadcc8] bg-white px-3 py-2 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full border border-[#eadcc8] bg-[#fdf9f3] p-0.5">
            <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></button>
            <label className="relative flex h-9 cursor-pointer items-center gap-2 px-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-[#b5452f]" />{prettyDate}
              <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a date" />
            </label>
            <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {!isToday && <Button variant="ghost" size="sm" className="h-9 rounded-full" onClick={() => setDate(now.date)}>Today</Button>}

          <div className="order-last flex w-full gap-2 overflow-x-auto text-xs sm:order-none sm:w-auto">
            <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#f3e8dc] px-3 font-semibold text-[#5b3a2e]">{stats.bookings} bookings</span>
            <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#f3e8dc] px-3 font-semibold text-[#5b3a2e]"><Users className="h-3.5 w-3.5" />{stats.guests} guests</span>
            {stats.pending > 0 && <span className="flex h-8 shrink-0 items-center rounded-full bg-amber-100 px-3 font-semibold text-amber-800">{stats.pending} pending</span>}
            {conflicts.size > 0 && <span className="flex h-8 shrink-0 items-center rounded-full bg-red-100 px-3 font-semibold text-red-700">{conflicts.size} in conflict</span>}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => void load()} aria-label="Refresh">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 rounded-full border-[#eadcc8]" disabled={exporting}>
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="ml-1.5 hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{prettyDate}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void runExport("png-area")}><ImageDown className="mr-2 h-4 w-4" />Image · {AREAS.find((item) => item.value === area)?.label}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runExport("png-all")}><ImageDown className="mr-2 h-4 w-4" />Image · all areas</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void runExport("csv")}><FileSpreadsheet className="mr-2 h-4 w-4" />Spreadsheet (CSV)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="h-9 rounded-full bg-[#c0392b] hover:bg-[#a93226]" onClick={() => setDialog({ booking: null, draft: { date, area, tableIds: [], startTime: "19:00" } })}>
              <Plus className="h-4 w-4" /><span className="ml-1 hidden sm:inline">New booking</span>
            </Button>
          </div>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Areas">
          {AREAS.map((item) => (
            <button key={item.value} role="tab" aria-selected={area === item.value} onClick={() => setArea(item.value)}
              className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition", area === item.value ? "bg-[#713a2e] text-white" : "bg-[#f3e8dc] text-[#5b3a2e] hover:bg-[#ead8c6]")}>
              {item.label}
              {perArea(item.value) > 0 && <span className={cn("rounded-full px-1.5 text-[11px]", area === item.value ? "bg-white/20" : "bg-white")}>{perArea(item.value)}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Grid */}
        <div className="px-2 pt-3 sm:px-5">
          <div ref={gridRef} className="overflow-x-auto rounded-2xl border border-[#eadcc8] bg-white shadow-sm">
            <div className="relative min-w-[680px]">
              <div className="sticky top-0 z-20 flex border-b border-[#eadcc8] bg-[#fdf9f3]">
                <div className="sticky left-0 z-30 shrink-0 border-r border-[#eadcc8] bg-[#fdf9f3]" style={{ width: LABEL_W }} />
                <div className="relative h-9 flex-1">
                  {VIEW_SLOTS.map((slot, index) => (
                    <span key={slot} className={cn("absolute top-0 flex h-full items-center pl-1.5 text-[11px]", slot.endsWith(":00") ? "font-bold text-[#5b3a2e]" : "text-[#b39b8c]")} style={{ left: `${(index / VIEW_SLOTS.length) * 100}%` }}>
                      {slot.endsWith(":00") ? hourLabel(slot) : ":30"}
                    </span>
                  ))}
                </div>
              </div>

              <div className="relative">
                {rows.map((table, index) => (
                  <div key={table.id} className={cn("flex border-b border-[#f3e8dc] last:border-0", index % 2 && "bg-[#fffcf7]")} style={{ height: ROW_H }}>
                    <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-[#eadcc8] bg-inherit px-3" style={{ width: LABEL_W, background: index % 2 ? "#fffcf7" : "#fff" }}>
                      <span className="text-sm font-bold text-[#2b1d17]">{table.tableNumber}</span>
                      <span className="text-[10px] text-[#9a7b6c]">{table.capacity} seats</span>
                    </div>
                    <div className="relative flex-1 cursor-copy" onClick={(event) => createAt(table, event)} title="Click to add a booking here">
                      {VIEW_SLOTS.map((slot, slotIndex) => (
                        <span key={slot} className={cn("absolute inset-y-0 border-l", slot.endsWith(":00") ? "border-[#eadcc8]" : "border-dashed border-[#f3e8dc]")} style={{ left: `${(slotIndex / VIEW_SLOTS.length) * 100}%` }} />
                      ))}
                    </div>
                  </div>
                ))}

                {/* Booking blocks, positioned over the rows */}
                <div className="pointer-events-none absolute inset-y-0 right-0 z-[1]" style={{ left: LABEL_W }}>
                  {areaBookings.flatMap((booking) => {
                    const range = span(booking.startTime, booking.endTime);
                    if (!range.visible) return [];
                    const style = STATUS_STYLE[booking.status];
                    const conflict = conflicts.has(booking.id);
                    const past = isToday ? toMinutes(booking.endTime) <= toMinutes(now.time) : date < now.date;
                    return rowRuns(booking, rows).map((run) => (
                      <button key={`${booking.id}-${run.start}`} onClick={() => setDialog({ booking })}
                        className={cn("pointer-events-auto absolute overflow-hidden rounded-xl px-2 py-1 text-left shadow-sm transition hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#713a2e]",
                          booking.status === "PENDING" && "border-2 border-dashed", past && "opacity-55 saturate-50")}
                        style={{
                          left: `calc(${range.left * 100}% + 2px)`, width: `calc(${range.width * 100}% - 4px)`,
                          top: run.start * ROW_H + 4, height: run.length * ROW_H - 8,
                          background: style.fill, color: style.text, borderColor: conflict ? CONFLICT_COLOR : style.border,
                          boxShadow: conflict ? `0 0 0 2px ${CONFLICT_COLOR}` : undefined,
                        }}
                        title={`${booking.customerName} · ${booking.numberOfGuests} guests · ${booking.startTime}–${booking.endTime}${booking.note ? ` · ${booking.note}` : ""}`}
                      >
                        <span className="flex items-center gap-1 truncate text-xs font-bold leading-4">
                          {booking.customerName}
                          {booking.note && <StickyNote className="h-3 w-3 shrink-0 opacity-80" />}
                        </span>
                        <span className="block truncate text-[10px] leading-4 opacity-90">
                          {booking.numberOfGuests}p · {booking.startTime}–{booking.endTime}
                          {booking.tables.length > 1 && ` · ${[...booking.tables].sort(byTableNumber).map((table) => table.tableNumber).join(",")}`}
                        </span>
                        {run.length > 1 && booking.note && <span className="mt-0.5 block truncate rounded bg-black/10 px-1 text-[10px] italic">{booking.note}</span>}
                      </button>
                    ));
                  })}
                  {showNow && (
                    <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-[#c0392b]" style={{ left: `${nowFraction * 100}%` }}>
                      <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#c0392b]" />
                    </div>
                  )}
                </div>
                {!loading && !rows.length && <p className="p-6 text-center text-sm text-[#7a5a4c]">No tables in this area.</p>}
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-[#7a5a4c]">
            <Legend fill={STATUS_STYLE.APPROVED.fill} border={STATUS_STYLE.APPROVED.border} label="Confirmed" />
            <Legend fill={STATUS_STYLE.PENDING.fill} border={STATUS_STYLE.PENDING.border} label="Pending" dashed />
            <Legend fill="#fff" border={CONFLICT_COLOR} label="Table conflict" />
            <span>Click an empty slot to add a booking.</span>
            {outside.length > 0 && <span className="font-semibold text-amber-700">{outside.length} booking(s) outside 5–10pm — see the list below.</span>}
          </div>
        </div>

        {/* Day list */}
        <div className="px-2 pb-24 pt-5 sm:px-5">
          <div className="mb-2 flex items-center gap-1.5">
            {(["active", "closed"] as const).map((value) => (
              <button key={value} onClick={() => setListTab(value)}
                className={cn("h-8 rounded-full px-3.5 text-sm font-semibold", listTab === value ? "bg-[#2b1d17] text-white" : "bg-[#f3e8dc] text-[#5b3a2e]")}>
                {value === "active" ? `Bookings (${active.length})` : `Cancelled & rejected (${closed.length})`}
              </button>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {listed.map((booking) => (
              <button key={booking.id} onClick={() => setDialog({ booking })}
                className={cn("flex items-start gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:border-[#c9a98c]", conflicts.has(booking.id) ? "border-red-300" : "border-[#eadcc8]")}>
                <div className="w-12 shrink-0 rounded-xl bg-[#fdf9f3] py-1.5 text-center">
                  <p className="text-sm font-bold text-[#2b1d17]">{booking.startTime}</p>
                  <p className="text-[10px] text-[#9a7b6c]">{booking.endTime}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{booking.customerName}</p>
                    <StatusBadge status={booking.status} className="ml-auto shrink-0 px-2 py-0 text-[10px]" />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#7a5a4c]">
                    {booking.numberOfGuests} guests · {AREAS.find((item) => item.value === booking.area)?.label} {[...booking.tables].sort(byTableNumber).map((table) => table.tableNumber).join(", ")}
                  </p>
                  {booking.note && <p className="mt-1 truncate rounded-lg bg-amber-50 px-2 py-0.5 text-xs italic text-amber-900">{booking.note}</p>}
                </div>
              </button>
            ))}
            {!loading && !listed.length && <p className="rounded-2xl border border-dashed border-[#e2cdb4] p-6 text-center text-sm text-[#7a5a4c] md:col-span-2 xl:col-span-3">Nothing here for this day.</p>}
          </div>
        </div>
      </div>

      <BookingDialog
        open={Boolean(dialog)}
        onOpenChange={(open) => !open && setDialog(null)}
        booking={dialog?.booking ?? null}
        draft={dialog?.draft}
        tables={tables}
        dayBookings={bookings}
        onChanged={() => void load()}
      />
    </div>
  );
}

function Legend({ fill, border, label, dashed }: { fill: string; border: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded border-2", dashed && "border-dashed")} style={{ background: fill, borderColor: border }} />{label}
    </span>
  );
}
