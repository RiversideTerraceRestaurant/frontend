import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Inbox, Loader2, Phone, RefreshCw, Search, StickyNote, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AREAS, adminBookingApi } from "@/lib/bookingApi";
import { useBookingRealtime } from "@/hooks/use-booking-realtime";
import { addDays, restaurantNow } from "@/lib/bookingSlots";
import type { Booking, RestaurantTable } from "@/types/booking";
import { BookingDialog, StatusBadge } from "@/components/admin/BookingDialog";
import { STATUS_STYLE, byTableNumber } from "@/features/time-map/timeMapUtils";
import { cn } from "@/lib/utils";

type StatusFilter = "PENDING" | "APPROVED" | "ALL" | "REJECTED" | "CANCELLED";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Confirmed" },
  { value: "ALL", label: "All" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];
const PAGE_SIZE = 12;

/** Reservations inbox: filter, approve/reject in one tap, open a booking to edit it. */
export function AdminBookings() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = restaurantNow().date;
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [date, setDate] = useState("");
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ content: Booking[]; totalElements: number; totalPages: number }>({ content: [], totalElements: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [rejecting, setRejecting] = useState<Booking | null>(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState<number | null>(null);
  const requestRef = useRef(0);

  // Debounce typing in the search box.
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(0); }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const data = await adminBookingApi.bookingsPage({
        status: status === "ALL" ? "" : status, date, area, search: query, page: String(page), size: String(PAGE_SIZE),
      });
      if (request === requestRef.current) setResult(data);
    } catch (error) {
      if (request === requestRef.current) toast({ title: "Cannot load bookings", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [status, date, area, query, page, toast]);
  useEffect(() => { void load(); }, [load]);
  useBookingRealtime(() => { void load(); });
  useEffect(() => { void adminBookingApi.tables().then(setTables).catch(() => undefined); }, []);

  // Deep links from emails / push notifications: ?bookingId=123
  useEffect(() => {
    const id = Number(searchParams.get("bookingId"));
    if (!id) return;
    adminBookingApi.booking(id).then(setSelected).catch((error) => toast({ title: "Cannot open booking", description: error instanceof Error ? error.message : "Booking not found.", variant: "destructive" }));
  }, [searchParams, toast]);
  const closeSelected = () => {
    setSelected(null);
    if (searchParams.has("bookingId")) { searchParams.delete("bookingId"); setSearchParams(searchParams, { replace: true }); }
  };

  const approve = async (booking: Booking) => {
    setWorking(booking.id);
    try {
      const updated = await adminBookingApi.approveBooking(booking.id);
      toast({ title: "Booking approved", description: `${updated.customerName} · ${updated.bookingDate} ${updated.startTime}` });
      if (updated.warning) toast({ title: "Email not sent", description: updated.warning, variant: "destructive" });
      await load();
    } catch (error) {
      toast({ title: "Cannot approve", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  };
  const reject = async () => {
    if (!rejecting || !reason.trim()) return;
    setWorking(rejecting.id);
    try {
      const updated = await adminBookingApi.rejectBooking(rejecting.id, reason.trim());
      toast({ title: "Booking rejected", description: updated.customerName });
      if (updated.warning) toast({ title: "Email not sent", description: updated.warning, variant: "destructive" });
      setRejecting(null);
      setReason("");
      await load();
    } catch (error) {
      toast({ title: "Cannot reject", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  };

  const dateChips = [
    { value: "", label: "All dates" },
    { value: today, label: "Today" },
    { value: addDays(today, 1), label: "Tomorrow" },
  ];
  const customDate = date && !dateChips.some((chip) => chip.value === date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#2b1d17]">Reservations</h2>
          <p className="text-sm text-[#7a5a4c]">{result.totalElements} {status === "ALL" ? "" : STATUS_FILTERS.find((item) => item.value === status)?.label.toLowerCase()} booking(s){date ? ` on ${date}` : ""}</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-3xl border border-[#eadcc8] bg-white p-3 shadow-sm sm:p-4">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {STATUS_FILTERS.map((item) => (
            <button key={item.value} onClick={() => { setStatus(item.value); setPage(0); }}
              className={cn("h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition", status === item.value ? "bg-[#713a2e] text-white" : "bg-[#f3e8dc] text-[#5b3a2e] hover:bg-[#ead8c6]")}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-[#eadcc8] bg-[#fdf9f3] px-3">
            <Search className="h-4 w-4 text-[#9a7b6c]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email or phone" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <div className="flex gap-1.5 overflow-x-auto">
            {dateChips.map((chip) => (
              <button key={chip.label} onClick={() => { setDate(chip.value); setPage(0); }}
                className={cn("h-10 shrink-0 rounded-xl px-3 text-sm font-medium", date === chip.value ? "bg-[#2b1d17] text-white" : "border border-[#eadcc8] bg-white text-[#5b3a2e]")}>
                {chip.label}
              </button>
            ))}
            <label className={cn("relative flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-medium", customDate ? "bg-[#2b1d17] text-white" : "border border-[#eadcc8] bg-white text-[#5b3a2e]")}>
              <CalendarDays className="h-4 w-4" />{customDate ? date : "Pick"}
              <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(0); }} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a date" />
            </label>
          </div>
          <select value={area} onChange={(event) => { setArea(event.target.value); setPage(0); }} className="h-10 rounded-xl border border-[#eadcc8] bg-white px-3 text-sm">
            <option value="">All areas</option>
            {AREAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="grid gap-3 lg:grid-cols-2">
        {result.content.map((booking) => {
          const style = STATUS_STYLE[booking.status];
          const phone = booking.customerPhone !== "0000000000" ? booking.customerPhone : "";
          return (
            <article key={booking.id} className="relative overflow-hidden rounded-3xl border border-[#eadcc8] bg-white shadow-sm">
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: style.border }} aria-hidden="true" />
              <button onClick={() => setSelected(booking)} className="block w-full p-4 pl-5 text-left">
                <div className="flex items-start gap-3">
                  <div className="w-16 shrink-0 rounded-2xl bg-[#fdf9f3] py-2 text-center">
                    <p className="text-[11px] font-semibold uppercase text-[#b5452f]">{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${booking.bookingDate}T00:00:00Z`))}</p>
                    <p className="text-sm font-bold text-[#2b1d17]">{booking.bookingDate.slice(8, 10)}/{booking.bookingDate.slice(5, 7)}</p>
                    <p className="text-xs font-semibold text-[#5b3a2e]">{booking.startTime}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 truncate font-semibold text-[#2b1d17]">{booking.customerName}</p>
                      <StatusBadge status={booking.status} className="shrink-0 text-[10px]" />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#7a5a4c]">
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{booking.numberOfGuests}</span>
                      <span>{AREAS.find((item) => item.value === booking.area)?.label} · {[...booking.tables].sort(byTableNumber).map((table) => table.tableNumber).join(", ")}</span>
                      <span>{booking.startTime}–{booking.endTime}</span>
                      {phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{phone}</span>}
                    </p>
                    {booking.note && <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"><StickyNote className="mt-0.5 h-3 w-3 shrink-0" />{booking.note}</p>}
                    <p className="mt-1.5 text-[10px] text-[#b39b8c]">{booking.bookingCode} · requested {new Date(booking.createdAt).toLocaleString("en-GB")}</p>
                  </div>
                </div>
              </button>
              {booking.status === "PENDING" && (
                <div className="flex gap-2 border-t border-[#f3e8dc] bg-[#fffcf7] px-4 py-2.5 pl-5">
                  <Button size="sm" className="h-9 flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={working === booking.id} onClick={() => void approve(booking)}>
                    {working === booking.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 flex-1 rounded-xl border-red-200 text-red-700 hover:bg-red-50" disabled={working === booking.id} onClick={() => { setRejecting(booking); setReason(""); }}>
                    <X className="mr-1.5 h-4 w-4" />Reject
                  </Button>
                </div>
              )}
            </article>
          );
        })}
        {!loading && result.content.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-[#e2cdb4] bg-white/60 p-10 text-center text-[#7a5a4c] lg:col-span-2">
            <Inbox className="h-8 w-8" />
            <p className="font-medium">{status === "PENDING" ? "No requests waiting for approval." : "No bookings match these filters."}</p>
          </div>
        )}
        {loading && result.content.length === 0 && <div className="flex justify-center p-10 lg:col-span-2"><Loader2 className="h-6 w-6 animate-spin text-[#713a2e]" /></div>}
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-[#eadcc8] bg-white px-4 py-2.5 text-sm">
          <span className="text-[#7a5a4c]">Page {page + 1} of {result.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={loading || page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={loading || page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <BookingDialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && closeSelected()}
        booking={selected}
        tables={tables}
        onChanged={() => void load()}
      />

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.customerName}'s request?</DialogTitle>
            <DialogDescription>The guest receives this reason by email.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="reject-reason" className="sr-only">Reason</Label>
          <Textarea id="reject-reason" autoFocus rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. We are fully booked at this time. Please choose another slot." />
          <div className="flex flex-wrap gap-2">
            {["We are fully booked at this time.", "The restaurant is closed for a private event.", "Please call us to arrange a larger group."].map((text) => (
              <button key={text} onClick={() => setReason(text)} className="rounded-full bg-[#f3e8dc] px-3 py-1 text-xs text-[#5b3a2e] hover:bg-[#ead8c6]">{text}</button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(null)}>Back</Button>
            <Button variant="destructive" disabled={!reason.trim() || working !== null} onClick={() => void reject()}>
              {working !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reject booking
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

