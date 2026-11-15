import type { Booking, BookingStatus, RestaurantArea, RestaurantTable } from "@/types/booking";
import { AREAS } from "@/lib/bookingApi";

/** The time map always shows the dinner window. */
export const VIEW_START = "17:00";
export const VIEW_END = "22:00";
export const ACTIVE_STATUSES: BookingStatus[] = ["PENDING", "APPROVED", "COMPLETED"];

export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const VIEW_SLOTS: string[] = [];
for (let minutes = toMinutes(VIEW_START); minutes < toMinutes(VIEW_END); minutes += 30) VIEW_SLOTS.push(toTime(minutes));

export const hourLabel = (time: string) => {
  const hour = Number(time.slice(0, 2));
  return `${hour % 12 || 12}${time.slice(3) === "00" ? "" : `:${time.slice(3)}`}${hour >= 12 ? "pm" : "am"}`;
};
export const areaLabel = (area: RestaurantArea) => AREAS.find((item) => item.value === area)?.label ?? area;
export const byTableNumber = (a: { tableNumber: string }, b: { tableNumber: string }) =>
  a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true, sensitivity: "base" });

/** Horizontal position of a time range inside the 5–10pm window, as fractions (0–1). */
export function span(start: string, end: string) {
  const from = toMinutes(VIEW_START);
  const total = toMinutes(VIEW_END) - from;
  const left = Math.max(0, toMinutes(start) - from) / total;
  const right = Math.min(total, toMinutes(end) - from) / total;
  return { left, width: Math.max(0, right - left), visible: right > 0 && left < 1 };
}

export const isActive = (booking: Booking) => ACTIVE_STATUSES.includes(booking.status);

/** Bookings that share a table with another active booking at an overlapping time. */
export function conflictingIds(bookings: Booking[]) {
  const active = bookings.filter(isActive);
  const ids = new Set<number>();
  for (const a of active) {
    for (const b of active) {
      if (a.id >= b.id || a.bookingDate !== b.bookingDate) continue;
      const shared = a.tables.some((table) => b.tables.some((other) => other.id === table.id));
      if (shared && toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(a.endTime) > toMinutes(b.startTime)) { ids.add(a.id); ids.add(b.id); }
    }
  }
  return ids;
}

/** Groups a booking's tables into runs of neighbouring rows so one block can span them. */
export function rowRuns(booking: Booking, rows: RestaurantTable[]) {
  const indexes = booking.tables.map((table) => rows.findIndex((row) => row.id === table.id)).filter((index) => index >= 0).sort((a, b) => a - b);
  const runs: { start: number; length: number }[] = [];
  for (const index of indexes) {
    const last = runs.at(-1);
    if (last && last.start + last.length === index) last.length++;
    else runs.push({ start: index, length: 1 });
  }
  return runs;
}

export const STATUS_STYLE: Record<BookingStatus, { label: string; fill: string; text: string; border: string }> = {
  PENDING: { label: "Pending", fill: "#fff4d6", text: "#7a4b00", border: "#f0b429" },
  APPROVED: { label: "Confirmed", fill: "#2f7a4f", text: "#ffffff", border: "#2f7a4f" },
  COMPLETED: { label: "Completed", fill: "#94a3b8", text: "#ffffff", border: "#94a3b8" },
  REJECTED: { label: "Rejected", fill: "#fde2e2", text: "#9b1c1c", border: "#f19999" },
  CANCELLED: { label: "Cancelled", fill: "#eceff3", text: "#5b6472", border: "#c5ccd6" },
};
export const CONFLICT_COLOR = "#dc2626";

// ---------------- export ----------------

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const prettyDate = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

/** Spreadsheet of the day's bookings (UTF-8 with BOM so Excel keeps Vietnamese names). */
export function exportCsv(date: string, bookings: Booking[]) {
  const header = ["Code", "Date", "Start", "End", "Area", "Tables", "Guests", "Name", "Phone", "Email", "Status", "Note"];
  const rows = [...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((booking) => [
    booking.bookingCode, booking.bookingDate, booking.startTime, booking.endTime, areaLabel(booking.area),
    [...booking.tables].sort(byTableNumber).map((table) => table.tableNumber).join(" "), booking.numberOfGuests, booking.customerName,
    booking.customerPhone === "0000000000" ? "" : booking.customerPhone,
    booking.customerEmail.endsWith(".local") ? "" : booking.customerEmail, STATUS_STYLE[booking.status].label, booking.note ?? "",
  ]);
  const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `time-map-${date}.csv`);
}

/** Draws a print-quality PNG of the 5–10pm grid for the given areas. */
export async function exportPng(date: string, areas: RestaurantArea[], tables: RestaurantTable[], bookings: Booking[]) {
  const scale = 2;
  const pad = 32;
  const labelW = 96;
  const slotW = 92;
  const rowH = 40;
  const headerH = 30;
  const gridW = VIEW_SLOTS.length * slotW;
  const width = pad * 2 + labelW + gridW;
  const sections = areas.map((area) => ({ area, rows: tables.filter((table) => table.area === area).sort(byTableNumber) })).filter((section) => section.rows.length);
  const sectionH = (rows: number) => 40 + headerH + rows * rowH + 28;
  const height = pad + 70 + sections.reduce((sum, section) => sum + sectionH(section.rows.length), 0) + 40 + pad;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  ctx.scale(scale, scale);
  const font = (size: number, weight = 400) => `${weight} ${size}px "Nunito Sans", Inter, system-ui, sans-serif`;
  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const fitText = (text: string, maxWidth: number) => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let value = text;
    while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
    return `${value}…`;
  };

  ctx.fillStyle = "#faf5ec";
  ctx.fillRect(0, 0, width, height);
  const conflicts = conflictingIds(bookings);
  const active = bookings.filter(isActive);
  ctx.fillStyle = "#2b1d17";
  ctx.font = font(24, 700);
  ctx.fillText("Riverside Terrace · Time map", pad, pad + 26);
  ctx.font = font(14);
  ctx.fillStyle = "#7a5a4c";
  const guests = active.filter((booking) => areas.includes(booking.area)).reduce((sum, booking) => sum + booking.numberOfGuests, 0);
  const count = active.filter((booking) => areas.includes(booking.area)).length;
  ctx.fillText(`${prettyDate(date)} · 5pm–10pm · ${count} bookings · ${guests} guests`, pad, pad + 50);

  let y = pad + 70;
  for (const { area, rows } of sections) {
    ctx.fillStyle = "#713a2e";
    ctx.font = font(17, 700);
    ctx.fillText(areaLabel(area), pad, y + 24);
    y += 40;
    const gridX = pad + labelW;
    // Header
    ctx.fillStyle = "#f3e8dc";
    rounded(pad, y, labelW + gridW, headerH, 8);
    ctx.fill();
    ctx.fillStyle = "#5b3a2e";
    ctx.font = font(12, 700);
    VIEW_SLOTS.forEach((slot, index) => { if (slot.endsWith(":00")) ctx.fillText(hourLabel(slot), gridX + index * slotW + 6, y + 20); });
    y += headerH;
    // Rows
    rows.forEach((row, index) => {
      const rowY = y + index * rowH;
      ctx.fillStyle = index % 2 ? "#fdf9f3" : "#ffffff";
      ctx.fillRect(pad, rowY, labelW + gridW, rowH);
      ctx.fillStyle = "#2b1d17";
      ctx.font = font(13, 700);
      ctx.fillText(row.tableNumber, pad + 10, rowY + 18);
      ctx.fillStyle = "#9a7b6c";
      ctx.font = font(10);
      ctx.fillText(`${row.capacity} seats`, pad + 10, rowY + 32);
    });
    ctx.strokeStyle = "#eadcc8";
    ctx.lineWidth = 1;
    VIEW_SLOTS.forEach((slot, index) => {
      ctx.globalAlpha = slot.endsWith(":00") ? 1 : 0.45;
      ctx.beginPath();
      ctx.moveTo(gridX + index * slotW + 0.5, y);
      ctx.lineTo(gridX + index * slotW + 0.5, y + rows.length * rowH);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    for (let index = 0; index <= rows.length; index++) {
      ctx.beginPath();
      ctx.moveTo(pad, y + index * rowH + 0.5);
      ctx.lineTo(pad + labelW + gridW, y + index * rowH + 0.5);
      ctx.stroke();
    }
    // Bookings
    for (const booking of active.filter((item) => item.area === area || item.tables.some((table) => table.area === area))) {
      const range = span(booking.startTime, booking.endTime);
      if (!range.visible) continue;
      const style = STATUS_STYLE[booking.status];
      for (const run of rowRuns(booking, rows)) {
        const bx = gridX + range.left * gridW + 2;
        const bw = Math.max(range.width * gridW - 4, 28);
        const by = y + run.start * rowH + 3;
        const bh = run.length * rowH - 6;
        ctx.fillStyle = style.fill;
        rounded(bx, by, bw, bh, 7);
        ctx.fill();
        ctx.lineWidth = conflicts.has(booking.id) ? 3 : 1.5;
        ctx.strokeStyle = conflicts.has(booking.id) ? CONFLICT_COLOR : style.border;
        ctx.stroke();
        ctx.save();
        rounded(bx, by, bw, bh, 7);
        ctx.clip();
        ctx.fillStyle = style.text;
        ctx.font = font(12, 700);
        ctx.fillText(fitText(booking.customerName, bw - 12), bx + 7, by + 15);
        ctx.font = font(10);
        const detail = `${booking.numberOfGuests}p · ${booking.startTime}–${booking.endTime}${booking.tables.length > 1 ? ` · ${[...booking.tables].sort(byTableNumber).map((table) => table.tableNumber).join(",")}` : ""}`;
        if (bh > 26) ctx.fillText(fitText(detail, bw - 12), bx + 7, by + 28);
        if (booking.note && bh > 42) {
          ctx.font = font(10, 600);
          ctx.fillText(fitText(`✎ ${booking.note}`, bw - 12), bx + 7, by + 41);
        }
        ctx.restore();
      }
    }
    y += rows.length * rowH + 28;
  }
  // Legend
  let x = pad;
  ctx.font = font(12);
  for (const [label, fill, border] of [["Confirmed", STATUS_STYLE.APPROVED.fill, STATUS_STYLE.APPROVED.border], ["Pending", STATUS_STYLE.PENDING.fill, STATUS_STYLE.PENDING.border], ["Conflict", "#ffffff", CONFLICT_COLOR]] as const) {
    ctx.fillStyle = fill;
    rounded(x, y, 16, 16, 4);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#5b3a2e";
    ctx.fillText(label, x + 22, y + 13);
    x += 30 + ctx.measureText(label).width + 14;
  }
  ctx.fillStyle = "#9a7b6c";
  ctx.textAlign = "right";
  ctx.fillText(`Exported ${new Date().toLocaleString("en-GB")}`, width - pad, y + 13);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the image.");
  download(blob, `time-map-${date}${areas.length === 1 ? `-${areas[0].toLowerCase()}` : ""}.png`);
}
