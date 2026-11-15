import { useEffect, useMemo, useState } from "react";
import { Ban, Check, Loader2, Mail, Phone, RotateCcw, Save, StickyNote, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AREAS, adminBookingApi } from "@/lib/bookingApi";
import type { Booking, RestaurantArea, RestaurantTable } from "@/types/booking";
import { STATUS_STYLE, byTableNumber, isActive, toMinutes, toTime } from "@/features/time-map/timeMapUtils";
import { cn } from "@/lib/utils";

const PLACEHOLDER_EMAIL = "timemap@riversideterrace.local";
const PLACEHOLDER_PHONE = "0000000000";
const TIME_OPTIONS: string[] = [];
for (let minutes = 10 * 60; minutes <= 23 * 60 + 30; minutes += 30) TIME_OPTIONS.push(toTime(minutes));

export interface BookingDraft { date: string; area: RestaurantArea; tableIds: number[]; startTime: string }

export function StatusBadge({ status, className }: { status: Booking["status"]; className?: string }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", className)} style={{ background: style.fill, color: style.text, borderColor: style.border }}>
      {style.label}
    </span>
  );
}

/**
 * Create, review and edit a booking. Shared by the time map and the reservations inbox.
 * `dayBookings` lets the table picker mark tables already taken at the chosen time.
 */
export function BookingDialog({
  open, onOpenChange, booking, draft, tables, dayBookings = [], onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
  draft?: BookingDraft;
  tables: RestaurantTable[];
  dayBookings?: Booking[];
  onChanged?: (booking?: Booking) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState(() => formFrom(booking, draft));
  useEffect(() => {
    if (open) { setForm(formFrom(booking, draft)); setRejecting(false); setReason(""); }
  }, [open, booking, draft]);

  const areaTables = useMemo(() => tables.filter((table) => table.area === form.area).sort(byTableNumber), [tables, form.area]);
  const taken = useMemo(() => {
    const ids = new Set<number>();
    for (const other of dayBookings) {
      if (other.id === booking?.id || !isActive(other) || other.bookingDate !== form.date) continue;
      if (toMinutes(other.startTime) < toMinutes(form.endTime) && toMinutes(other.endTime) > toMinutes(form.startTime)) other.tables.forEach((table) => ids.add(table.id));
    }
    return ids;
  }, [dayBookings, booking, form.date, form.startTime, form.endTime]);
  const capacity = areaTables.filter((table) => form.tableIds.includes(table.id)).reduce((sum, table) => sum + table.capacity, 0);

  const run = async (label: string, action: () => Promise<Booking | void>, done: string) => {
    setBusy(label);
    try {
      const result = await action();
      toast({ title: done, description: result && "bookingCode" in result ? result.bookingCode : undefined });
      if (result && result.warning) toast({ title: "Email not sent", description: result.warning, variant: "destructive" });
      onChanged?.(result || undefined);
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Action failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    if (!form.customerName.trim()) return toast({ title: "Customer name is required", variant: "destructive" });
    if (!form.tableIds.length) return toast({ title: "Choose at least one table", variant: "destructive" });
    if (form.endTime <= form.startTime) return toast({ title: "End time must be after start time", variant: "destructive" });
    const payload = {
      customerName: form.customerName.trim(),
      customerEmail: form.customerEmail.trim(),
      customerPhone: form.customerPhone.trim(),
      numberOfGuests: form.guests,
      bookingDate: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      area: form.area,
      note: form.note,
      tableIds: form.tableIds,
    };
    if (booking) {
      void run("save", () => adminBookingApi.updateBooking({
        ...booking, ...payload,
        customerEmail: payload.customerEmail || booking.customerEmail,
        customerPhone: payload.customerPhone || booking.customerPhone,
        tables: areaTables.filter((table) => form.tableIds.includes(table.id)),
      }), "Booking updated");
    } else {
      void run("save", () => adminBookingApi.createBooking({ ...payload, status: "APPROVED" }), "Booking created");
    }
  };

  const toggleTable = (id: number) => setForm((current) => {
    const tableIds = current.tableIds.includes(id) ? current.tableIds.filter((value) => value !== id) : [...current.tableIds, id];
    const seats = tables.filter((table) => tableIds.includes(table.id)).reduce((sum, table) => sum + table.capacity, 0);
    // Suggest a party size that fits the chosen tables; staff can still change it.
    return { ...current, tableIds, guests: tableIds.length > 1 || current.guests > seats ? Math.max(1, seats) : current.guests };
  });

  const status = booking?.status;
  const contactPhone = booking && booking.customerPhone !== PLACEHOLDER_PHONE ? booking.customerPhone : "";
  const contactEmail = booking && booking.customerEmail !== PLACEHOLDER_EMAIL ? booking.customerEmail : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto rounded-3xl p-0">
        <DialogHeader className="sticky top-0 z-10 border-b bg-white/95 px-5 pb-4 pt-5 text-left backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle className="text-lg">{booking ? booking.customerName : "New booking"}</DialogTitle>
            {status && <StatusBadge status={status} />}
          </div>
          <DialogDescription className="text-xs">
            {booking ? `${booking.bookingCode} · created ${new Date(booking.createdAt).toLocaleString("en-GB")}` : "Walk-in or phone booking. It is confirmed immediately."}
          </DialogDescription>
          {booking && (contactPhone || contactEmail) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {contactPhone && <a href={`tel:${contactPhone}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#f3e8dc] px-3 py-1 text-xs font-medium text-[#5b3a2e]"><Phone className="h-3.5 w-3.5" />{contactPhone}</a>}
              {contactEmail && <a href={`mailto:${contactEmail}`} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-[#f3e8dc] px-3 py-1 text-xs font-medium text-[#5b3a2e]"><Mail className="h-3.5 w-3.5" />{contactEmail}</a>}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-5 px-5 py-4">
          {booking?.rejectionReason && status === "REJECTED" && (
            <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-800">Rejected: {booking.rejectionReason}</p>
          )}

          {booking && (
            <div className="rounded-2xl border border-[#eadcc8] bg-[#fdf9f3] p-3">
              {rejecting ? (
                <div className="space-y-2">
                  <Label htmlFor="reject-reason">Reason sent to the guest</Label>
                  <Textarea id="reject-reason" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Fully booked at this time, please choose another slot." rows={2} />
                  <div className="flex gap-2">
                    <Button variant="destructive" disabled={!reason.trim() || busy !== null} onClick={() => void run("reject", () => adminBookingApi.rejectBooking(booking.id, reason.trim()), "Booking rejected")}>
                      {busy === "reject" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}Reject booking
                    </Button>
                    <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {status === "PENDING" && (
                    <>
                      <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy !== null} onClick={() => void run("approve", () => adminBookingApi.approveBooking(booking.id), "Booking approved")}>
                        {busy === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Approve
                      </Button>
                      <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={busy !== null} onClick={() => setRejecting(true)}>
                        <X className="mr-2 h-4 w-4" />Reject
                      </Button>
                    </>
                  )}
                  {(status === "CANCELLED" || status === "REJECTED") && (
                    <Button variant="outline" disabled={busy !== null} onClick={() => void run("restore", () => adminBookingApi.approveBooking(booking.id), "Booking restored")}>
                      {busy === "restore" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Restore & confirm
                    </Button>
                  )}
                  {(status === "PENDING" || status === "APPROVED") && (
                    <Button variant="ghost" className="text-red-700 hover:bg-red-50" disabled={busy !== null} onClick={() => { if (window.confirm("Cancel this booking? The guest will be emailed.")) void run("cancel", () => adminBookingApi.cancelBooking(booking.id), "Booking cancelled"); }}>
                      {busy === "cancel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}Cancel booking
                    </Button>
                  )}
                  {status === "APPROVED" && <p className="self-center text-xs text-[#7a5a4c]">Confirmed {booking.approvedAt ? new Date(booking.approvedAt).toLocaleString("en-GB") : ""}</p>}
                </div>
              )}
            </div>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="bd-name">Customer name</Label>
              <Input id="bd-name" className="mt-1 h-11" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="bd-phone">Phone</Label>
              <Input id="bd-phone" type="tel" className="mt-1 h-11" value={form.customerPhone} placeholder="Optional" onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="bd-email">Email</Label>
              <Input id="bd-email" type="email" className="mt-1 h-11" value={form.customerEmail} placeholder="Optional" onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="bd-date">Date</Label>
              <Input id="bd-date" type="date" className="mt-1 h-11" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="bd-start">From</Label>
                <select id="bd-start" className="mt-1 h-11 w-full rounded-md border bg-background px-2 text-sm" value={form.startTime} onChange={(event) => {
                  const startTime = event.target.value;
                  setForm({ ...form, startTime, endTime: toMinutes(form.endTime) > toMinutes(startTime) ? form.endTime : toTime(Math.min(toMinutes(startTime) + 120, 23 * 60 + 30)) });
                }}>
                  {TIME_OPTIONS.map((time) => <option key={time}>{time}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="bd-end">To</Label>
                <select id="bd-end" className="mt-1 h-11 w-full rounded-md border bg-background px-2 text-sm" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })}>
                  {TIME_OPTIONS.filter((time) => time > form.startTime).map((time) => <option key={time}>{time}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="bd-guests">Guests</Label>
                <Input id="bd-guests" type="number" min={1} max={200} className="mt-1 h-11" value={form.guests} onChange={(event) => setForm({ ...form, guests: Math.max(1, Number(event.target.value) || 1) })} />
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Label>Tables</Label>
              <div className="flex gap-1 overflow-x-auto">
                {AREAS.map((area) => (
                  <button key={area.value} type="button" onClick={() => setForm({ ...form, area: area.value, tableIds: area.value === form.area ? form.tableIds : [] })}
                    className={cn("h-8 shrink-0 rounded-full px-3 text-xs font-semibold", form.area === area.value ? "bg-[#713a2e] text-white" : "bg-[#f3e8dc] text-[#5b3a2e]")}>
                    {area.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {areaTables.map((table) => {
                const selected = form.tableIds.includes(table.id);
                const occupied = taken.has(table.id);
                return (
                  <button key={table.id} type="button" onClick={() => toggleTable(table.id)}
                    className={cn("relative rounded-xl border px-2 py-2 text-left transition",
                      selected ? "border-[#713a2e] bg-[#713a2e] text-white shadow-sm" : occupied ? "border-red-200 bg-red-50 text-red-800" : "border-[#eadcc8] bg-white hover:border-[#c9a98c]")}
                    title={occupied ? "Already booked at this time" : undefined}>
                    <span className="block text-sm font-bold">{table.tableNumber}</span>
                    <span className="block text-[10px] opacity-75">{occupied && !selected ? "busy" : `${table.capacity} seats`}</span>
                  </button>
                );
              })}
            </div>
            <p className={cn("mt-2 flex items-center gap-1.5 text-xs", capacity && capacity < form.guests ? "text-red-600" : "text-[#7a5a4c]")}>
              <Users className="h-3.5 w-3.5" />{form.tableIds.length} table(s) · {capacity} seats for {form.guests} guests
            </p>
          </section>

          <div>
            <Label htmlFor="bd-note" className="flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" />Note</Label>
            <Textarea id="bd-note" className="mt-1" rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Special requests, allergies…" />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white/95 px-5 py-3 backdrop-blur">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button className="bg-[#713a2e] hover:bg-[#5e2f25]" disabled={busy !== null} onClick={save}>
            {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{booking ? "Save changes" : "Create booking"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formFrom(booking: Booking | null, draft?: BookingDraft) {
  if (booking) {
    return {
      customerName: booking.customerName,
      customerPhone: booking.customerPhone === PLACEHOLDER_PHONE ? "" : booking.customerPhone,
      customerEmail: booking.customerEmail === PLACEHOLDER_EMAIL ? "" : booking.customerEmail,
      guests: booking.numberOfGuests,
      date: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      area: booking.area,
      tableIds: booking.tables.map((table) => table.id),
      note: booking.note ?? "",
    };
  }
  const start = draft?.startTime ?? "19:00";
  return {
    customerName: "", customerPhone: "", customerEmail: "", guests: 2,
    date: draft?.date ?? new Date().toISOString().slice(0, 10),
    startTime: start, endTime: toTime(Math.min(toMinutes(start) + 120, 23 * 60 + 30)),
    area: draft?.area ?? ("TERRACE" as RestaurantArea), tableIds: draft?.tableIds ?? [], note: "",
  };
}
