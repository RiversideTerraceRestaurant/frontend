import { Layer, Rect, Stage, Text } from "react-konva";
import { AlertCircle, CalendarCheck, Camera, CheckCircle2, Clock, ImageIcon, ImageOff, Loader2, RefreshCw, Sun, Home as HomeIcon, Shuffle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { useToast } from "@/hooks/use-toast";
import { AREAS, ApiError, publicBookingApi as publicApi } from "@/lib/bookingApi";
import { Booking as BookingResult, RequestOtpResponse, RestaurantArea, RestaurantTable, TableStatus } from "@/types/booking";
import { useBookingCopy } from "@/content/bookingCopy";
import { AREA_PHOTOS } from "@/content/areaPhotos";
import { BookingSearch, type BookingSearchValue } from "@/components/BookingSearch";
import { MAX_ONLINE_GUESTS, defaultEndFor, endSlotsFor, normaliseSearch, restaurantNow } from "@/lib/bookingSlots";
import { cn } from "@/lib/utils";
import { useTablePhotos } from "@/components/TablePhotoViewer";

const statusColor: Record<TableStatus, string> = {
  AVAILABLE: "#2f9e5b",
  HOLD: "#e3a008",
  RESERVED: "#d64545",
  OCCUPIED: "#8a4b2d",
  MAINTENANCE: "#9aa0a6",
};
const SELECTED_COLOR = "#2563eb";

const statusLabelKey: Record<TableStatus, string> = {
  AVAILABLE: "statusAvailable",
  HOLD: "statusHold",
  RESERVED: "statusReserved",
  OCCUPIED: "statusOccupied",
  MAINTENANCE: "statusMaintenance",
};

type Seating = "any" | "outside" | "inside";
const isArea = (value: string | null): value is RestaurantArea => AREAS.some((item) => item.value === value);

export default function Booking() {
  const [params, setParams] = useSearchParams();
  const initialSearch = useMemo(() => normaliseSearch(params.get("date"), params.get("time")), []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialGuests = Math.min(Math.max(Number(params.get("guests")) || 2, 1), MAX_ONLINE_GUESTS);
  const [area, setArea] = useState<RestaurantArea>(isArea(params.get("area")) ? (params.get("area") as RestaurantArea) : "TERRACE");
  const [seating, setSeating] = useState<Seating>(params.get("seating") === "inside" || params.get("seating") === "outside" ? (params.get("seating") as Seating) : "any");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tablesError, setTablesError] = useState("");
  const [finding, setFinding] = useState(false);
  const [findMessage, setFindMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [otpSession, setOtpSession] = useState<RequestOtpResponse | null>(null);
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [informationConfirmed, setInformationConfirmed] = useState(false);
  const [confirmationError, setConfirmationError] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const tablesRequestIdRef = useRef(0);
  const pendingSuggestedIdsRef = useRef<number[] | null>(null);
  const [canvasContainerWidth, setCanvasContainerWidth] = useState(520);
  const { toast } = useToast();
  const { t } = useBookingCopy();
  const openTablePhotos = useTablePhotos();
  const areaName = AREAS.find((item) => item.value === area)?.label as keyof typeof AREA_PHOTOS;
  const areaImages = AREA_PHOTOS[areaName] ?? [];

  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    numberOfGuests: String(initialGuests),
    bookingDate: initialSearch.date,
    startTime: initialSearch.time,
    endTime: defaultEndFor(initialSearch.time),
    note: "",
  });
  // The requested slot was in the past and has been moved forward.
  const adjusted = Boolean(params.get("time")) && (params.get("date") !== initialSearch.date || params.get("time") !== initialSearch.time);

  const displayTables = tables.filter((table) => table.area === area).sort((a, b) =>
    a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true, sensitivity: "base" }),
  );
  const selectedTables = displayTables.filter((table) => selectedTableIds.includes(table.id));
  const selectedCapacity = selectedTables.reduce((total, table) => total + table.capacity, 0);
  const guestCount = Number(form.numberOfGuests) || 0;
  const availableCount = displayTables.filter((table) => table.status === "AVAILABLE").length;

  // ---- floor plan geometry (RTR layout) ----
  const columnTableLayout = {
    TERRACE: { prefix: "T", leftMax: 6, rightMax: 12 },
    VERONA: { prefix: "V", leftMax: 10, rightMax: 16 },
    SORRENTO: { prefix: "S", leftMax: 4, rightMax: 6 },
  }[area as "TERRACE" | "VERONA" | "SORRENTO"];
  const useColumnTableLayout = Boolean(columnTableLayout);
  const tableNumberIndex = (table: RestaurantTable) => {
    if (!columnTableLayout) return Number.POSITIVE_INFINITY;
    const match = table.tableNumber.match(new RegExp(`^${columnTableLayout.prefix}(\\d+)$`, "i"));
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  };
  const leftColumnTables = displayTables.filter((table) => tableNumberIndex(table) <= (columnTableLayout?.leftMax ?? 0));
  const rightColumnTables = displayTables.filter((table) => {
    const index = tableNumberIndex(table);
    return Boolean(columnTableLayout) && index > columnTableLayout.leftMax && index <= columnTableLayout.rightMax;
  });
  const fallbackTables = displayTables.filter((table) => tableNumberIndex(table) === Number.POSITIVE_INFINITY);
  const canvasTables = useColumnTableLayout ? [...leftColumnTables, ...rightColumnTables, ...fallbackTables] : displayTables;
  const canvasWidth = 520;
  const tableWidth = 200;
  const tableHeight = 64;
  const rowGap = 16;
  const columnGap = 64;
  const canvasPadding = 20;
  const leftX = canvasPadding;
  const rightX = canvasPadding + tableWidth + columnGap;
  const rowCount = useColumnTableLayout
    ? Math.max(1, leftColumnTables.length, rightColumnTables.length + fallbackTables.length)
    : Math.max(1, Math.ceil(displayTables.length / 2));
  const canvasHeight = Math.max(240, canvasPadding * 2 + rowCount * (tableHeight + rowGap) - rowGap);
  const stageWidth = Math.max(1, Math.min(canvasWidth, canvasContainerWidth));
  const stageScale = stageWidth / canvasWidth;
  const stageHeight = canvasHeight * stageScale;

  const getTablePosition = (table: RestaurantTable) => {
    if (!useColumnTableLayout) {
      const index = displayTables.findIndex((item) => item.id === table.id);
      if (index < rowCount) return { x: leftX, y: canvasPadding + (rowCount - 1 - index) * (tableHeight + rowGap) };
      return { x: rightX, y: canvasPadding + (index - rowCount) * (tableHeight + rowGap) };
    }
    const numberIndex = tableNumberIndex(table);
    if (columnTableLayout && numberIndex <= columnTableLayout.leftMax) {
      return { x: leftX, y: canvasPadding + (leftColumnTables.length - 1 - leftColumnTables.findIndex((item) => item.id === table.id)) * (tableHeight + rowGap) };
    }
    if (columnTableLayout && numberIndex > columnTableLayout.leftMax && numberIndex <= columnTableLayout.rightMax) {
      return { x: rightX, y: canvasPadding + rightColumnTables.findIndex((item) => item.id === table.id) * (tableHeight + rowGap) };
    }
    return { x: rightX, y: canvasPadding + (rightColumnTables.length + fallbackTables.findIndex((item) => item.id === table.id)) * (tableHeight + rowGap) };
  };

  useEffect(() => {
    setSelectedTableIds([]);
    void loadTables({ clear: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the search inputs change
  }, [area, form.bookingDate, form.startTime, form.endTime]);

  useEffect(() => {
    const element = canvasContainerRef.current;
    if (!element) return;
    const updateWidth = () => setCanvasContainerWidth(Math.max(1, Math.floor(element.getBoundingClientRect().width) - 1));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Arriving from the home page or the chat: preselect tables or search straight away.
  useEffect(() => {
    const preset = (params.get("tables") || "").split(",").map(Number).filter(Boolean);
    if (preset.length) pendingSuggestedIdsRef.current = preset;
    else if (params.get("find") === "1") void findBest({ date: form.bookingDate, time: form.startTime, guests: guestCount }, seating);
    if (params.has("find") || params.has("tables")) {
      const next = new URLSearchParams(params);
      next.delete("find");
      next.delete("tables");
      setParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTables = async ({ clear = false }: { clear?: boolean } = {}) => {
    const requestId = tablesRequestIdRef.current + 1;
    tablesRequestIdRef.current = requestId;
    if (clear) setTables([]);
    setLoadingTables(true);
    setTablesError("");
    try {
      const data = await publicApi.availability({
        area,
        date: form.bookingDate,
        startTime: form.startTime,
        endTime: form.endTime,
        guests: Number(form.numberOfGuests) || 1,
      });
      if (requestId !== tablesRequestIdRef.current) return;
      setTables(data);
      if (pendingSuggestedIdsRef.current) {
        const wanted = pendingSuggestedIdsRef.current;
        setSelectedTableIds(wanted.filter((id) => data.some((table) => table.id === id && table.status === "AVAILABLE")));
        pendingSuggestedIdsRef.current = null;
      }
    } catch (error) {
      if (requestId !== tablesRequestIdRef.current) return;
      setTables([]);
      setTablesError(error instanceof Error ? error.message : t("bookingTryAgain"));
    } finally {
      if (requestId === tablesRequestIdRef.current) setLoadingTables(false);
    }
  };

  /** Search button: apply the date/time/party size and pick the best tables for the chosen seating. */
  const findBest = async (search: BookingSearchValue, seatingChoice: Seating = seating) => {
    const next = normaliseSearch(search.date, search.time);
    const endTime = form.startTime === next.time ? form.endTime : defaultEndFor(next.time);
    setForm((current) => ({ ...current, bookingDate: next.date, startTime: next.time, endTime, numberOfGuests: String(search.guests) }));
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("date", next.date);
      updated.set("time", next.time);
      updated.set("guests", String(search.guests));
      return updated;
    }, { replace: true });
    setFinding(true);
    setFindMessage(null);
    const order: ("outside" | "inside")[] = seatingChoice === "any" ? ["outside", "inside"] : [seatingChoice];
    try {
      for (const option of order) {
        try {
          const suggestion = await publicApi.suggestBestTable({ seating: option, date: next.date, startTime: next.time, endTime, guests: search.guests });
          pendingSuggestedIdsRef.current = suggestion.tables.map((table) => table.id);
          setArea(suggestion.area);
          setFindMessage({ ok: true, text: `${t("bookingFoundIn")} ${AREAS.find((item) => item.value === suggestion.area)?.label}: ${suggestion.tables.map((table) => table.tableNumber).join(", ")}` });
          return;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
        }
      }
      setFindMessage({ ok: false, text: t("bookingNoneFound") });
    } catch (error) {
      setFindMessage({ ok: false, text: error instanceof Error ? error.message : t("bookingTryAgain") });
    } finally {
      setFinding(false);
    }
  };
  // When the suggestion is in the area already shown, the effect above does not refire.
  useEffect(() => {
    if (!finding && pendingSuggestedIdsRef.current && !loadingTables) void loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply a pending suggestion once the search settles
  }, [finding]);

  const validate = () => {
    if (!form.customerName.trim()) return `${t("bookingCustomerName")} ${t("bookingRequired")}`;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail)) return t("bookingEmailInvalid");
    if (!/^[0-9+\-\s()]{8,20}$/.test(form.customerPhone)) return t("bookingPhoneInvalid");
    if (guestCount <= 0) return t("bookingGuestInvalid");
    if (guestCount > MAX_ONLINE_GUESTS) return t("bookingLargeParty");
    const now = restaurantNow();
    if (form.bookingDate < now.date || (form.bookingDate === now.date && form.startTime <= now.time)) return t("bookingPastTime");
    if (form.endTime <= form.startTime) return t("bookingEndAfterStart");
    if (selectedTables.length === 0) return t("bookingChooseTables");
    if (selectedTables.some((table) => table.status !== "AVAILABLE")) return t("bookingUnavailableSelected");
    if (selectedTables.some((table) => table.area !== area)) return t("bookingWrongAreaSelected");
    if (selectedCapacity < guestCount) return t("bookingCapacityTooSmall");
    if (area === "VERONA" && guestCount < 3) return t("bookingVeronaMinimum");
    return "";
  };

  // Konva can report one touch as both "tap" and "click"; count it once.
  const lastToggleRef = useRef({ id: 0, at: 0 });
  const toggleTable = (table: RestaurantTable) => {
    const now = Date.now();
    if (lastToggleRef.current.id === table.id && now - lastToggleRef.current.at < 450) return;
    lastToggleRef.current = { id: table.id, at: now };
    if (table.status !== "AVAILABLE") return;
    const warn = (description: string) => toast({ title: t("bookingFormIncomplete"), description, variant: "destructive" });
    const numbersOf = (list: RestaurantTable[]) => list.map((item) => Number(item.tableNumber.replace(/\D/g, ""))).sort((a, b) => a - b);
    const adjacent = (numbers: number[]) => numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1);
    const apply = (next: RestaurantTable[]) => {
      setSelectedTableIds(next.map((item) => item.id));
      // Seat as many guests as the chosen tables hold (max 6 online); keep a smaller party on one table.
      const capacity = next.reduce((total, item) => total + item.capacity, 0);
      if (next.length && (next.length > 1 || guestCount > capacity)) {
        setForm((current) => ({ ...current, numberOfGuests: String(Math.min(capacity, MAX_ONLINE_GUESTS)) }));
      }
    };

    if (selectedTableIds.includes(table.id)) {
      const remaining = selectedTables.filter((item) => item.id !== table.id);
      if (!adjacent(numbersOf(remaining))) return warn(t("bookingRemoveFromEnd"));
      apply(remaining);
      return;
    }
    const nextTables = [...selectedTables, table];
    const numbers = numbersOf(nextTables);
    // Tapping a table away from the current group starts a new selection.
    if (!adjacent(numbers)) return apply([table]);
    if (nextTables.length > 3) return warn(t("bookingMaxTables"));
    if (nextTables.reduce((total, item) => total + item.capacity, 0) > 6) return warn(t("bookingMaxCapacity"));
    if (area === "TERRACE" && numbers.includes(6) && numbers.includes(7)) return warn(t("bookingNoJoinT6T7"));
    if (area === "VERONA" && numbers.some((number) => number >= 11)) {
      const fixedPairs = [[11, 12], [13, 14], [15, 16]];
      if (!fixedPairs.some((pair) => numbers.every((number) => pair.includes(number))) || nextTables.length > 2) return warn(t("bookingVeronaPairs"));
    }
    apply(nextTables);
  };

  const submitBooking = async (event: FormEvent) => {
    event.preventDefault();
    if (!informationConfirmed) {
      setConfirmationError(true);
      toast({ title: t("bookingFormIncomplete"), description: t("bookingConfirmationRequired"), variant: "destructive" });
      return;
    }
    const message = validate();
    if (message) {
      toast({ title: t("bookingFormIncomplete"), description: message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const response = await publicApi.requestOtp({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        numberOfGuests: Number(form.numberOfGuests),
        bookingDate: form.bookingDate,
        startTime: form.startTime,
        endTime: form.endTime,
        area,
        note: form.note,
        tableIds: selectedTableIds,
      });
      setOtpSession(response);
      setOtp("");
      toast({ title: t("bookingOtpSent"), description: t("bookingOtpSentDescription") });
    } catch (error) {
      if (error instanceof ApiError && error.code === "TABLE_NOT_AVAILABLE") await loadTables();
      toast({ title: t("bookingCannotRequestOtp"), description: error instanceof Error ? error.message : t("bookingTryAnotherTable"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpSession) return;
    setSubmitting(true);
    try {
      const booking = await publicApi.verifyOtp(otpSession.verificationId, otp);
      setOtpSession(null);
      setResult(booking);
      if (booking.warning) toast({ title: t("bookingSuccessTitle"), description: booking.warning });
      await loadTables();
    } catch (error) {
      if (error instanceof ApiError && error.code === "TABLE_NOT_AVAILABLE") await loadTables();
      toast({ title: t("bookingOtpFailed"), description: error instanceof Error ? error.message : t("bookingTryAgain"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const resendOtp = async () => {
    if (!otpSession) return;
    try {
      const response = await publicApi.resendOtp(otpSession.verificationId);
      setOtpSession(response);
      setOtp("");
      toast({ title: t("bookingOtpSent"), description: t("bookingOtpSentDescription") });
    } catch (error) {
      toast({ title: t("bookingCannotRequestOtp"), description: error instanceof Error ? error.message : t("bookingTryAgain"), variant: "destructive" });
    }
  };

  const seatingOptions: { value: Seating; label: string; icon: typeof Sun }[] = [
    { value: "any", label: t("seatingAny"), icon: Shuffle },
    { value: "outside", label: t("bookingOutside"), icon: Sun },
    { value: "inside", label: t("bookingInside"), icon: HomeIcon },
  ];
  const selectionLabel = selectedTables.length
    ? `${selectedTables.map((table) => table.tableNumber).join(", ")} · ${selectedCapacity} ${t("bookingSeats")}`
    : t("bookingChooseTables");

  return (
    <div className="min-h-screen bg-[#faf5ec] text-[#2b1d17]">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#5e2f25] via-[#7d3d2f] to-[#b5452f] text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#f6d9a8]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-[#2f9e5b]/15 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-6 pt-7 sm:px-6 sm:pb-8 sm:pt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f6d9a8]">{t("bookingEyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t("bookingTitle")}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/80">{t("heroBookHint")}</p>
          <div className="mt-5 rounded-3xl bg-white/10 p-2 ring-1 ring-white/20 backdrop-blur">
            <BookingSearch
              variant="hero"
              busy={finding}
              value={{ date: form.bookingDate, time: form.startTime, guests: guestCount }}
              onSubmit={(value) => void findBest(value)}
            />
            <div className="mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t("bookingSeating")}>
              {seatingOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={seating === value}
                  onClick={() => setSeating(value)}
                  className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition", seating === value ? "bg-white text-[#713a2e] shadow-sm" : "text-white/85 hover:bg-white/15")}
                >
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
          </div>
          {(findMessage || adjusted) && (
            <p role="status" className={cn("mt-3 flex items-start gap-2 rounded-2xl px-3 py-2 text-sm", findMessage?.ok ? "bg-emerald-500/25 text-emerald-50" : "bg-white/15 text-white")}>
              {findMessage?.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              {findMessage?.text ?? t("bookingTimeAdjusted")}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:pb-12">
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="min-w-0 rounded-3xl border border-[#eadcc8] bg-white p-3 shadow-sm sm:p-5" aria-labelledby="tables-heading">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="tables-heading" className="flex items-center gap-2 text-base font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#713a2e] text-xs text-white">1</span>
                {t("bookingStepTable")}
              </h2>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={() => setShowPhotos(true)} aria-label={t("bookingAreaPhotos")}>
                  <ImageIcon className="h-4 w-4" /><span className="ml-1.5 hidden sm:inline">{t("bookingAreaPhotos")}</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={() => loadTables()} disabled={loadingTables} aria-label={t("bookingRefresh")}>
                  {loadingTables ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t("bookingArea")}>
              {AREAS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={area === item.value}
                  onClick={() => setArea(item.value)}
                  className={cn(
                    "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition",
                    area === item.value ? "border-[#713a2e] bg-[#713a2e] text-white shadow-sm" : "border-[#eadcc8] bg-[#fdf9f3] text-[#5b3a2e] hover:border-[#c9a98c]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="relative w-full min-w-0 overflow-hidden rounded-2xl border border-[#f0e4d4] bg-[#fdf9f3]">
              <div ref={canvasContainerRef} className="table-map-touch block w-full min-w-0 overflow-hidden">
                <Stage preventDefault={false} width={stageWidth} height={stageHeight} scaleX={stageScale} scaleY={stageScale}>
                  <Layer>
                    <Rect preventDefault={false} x={0} y={0} width={canvasWidth} height={canvasHeight} fill="#fdf9f3" />
                    {canvasTables.map((table) => {
                      const selected = selectedTableIds.includes(table.id);
                      const disabled = table.status !== "AVAILABLE";
                      const { x, y } = getTablePosition(table);
                      return (
                        <Rect
                          key={`${table.id}-hitbox`}
                          preventDefault={false}
                          x={x}
                          y={y}
                          width={tableWidth}
                          height={tableHeight}
                          cornerRadius={16}
                          fill={selected ? SELECTED_COLOR : statusColor[table.status]}
                          opacity={disabled ? 0.45 : 1}
                          stroke={selected ? "#1e40af" : "#ffffff"}
                          strokeWidth={selected ? 5 : 2}
                          shadowColor="rgba(60, 30, 20, 0.18)"
                          shadowBlur={selected ? 14 : 6}
                          shadowOffsetY={3}
                          onClick={() => toggleTable(table)}
                          onTap={() => toggleTable(table)}
                        />
                      );
                    })}
                    {canvasTables.map((table) => {
                      const disabled = table.status !== "AVAILABLE";
                      const { x, y } = getTablePosition(table);
                      return (
                        <Text
                          key={`${table.id}-label`}
                          x={x}
                          y={y + 12}
                          width={tableWidth}
                          height={tableHeight - 12}
                          align="center"
                          fill="#ffffff"
                          listening={false}
                          text={`${table.tableNumber}\n${table.capacity} ${t("bookingGuestLabel")}${disabled ? ` · ${t(statusLabelKey[table.status])}` : ""}`}
                          fontStyle="bold"
                          fontSize={17}
                          lineHeight={1.3}
                        />
                      );
                    })}
                  </Layer>
                </Stage>
              </div>
              {(loadingTables || tablesError || displayTables.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#fdf9f3]/85 p-6 text-center text-sm text-[#7a5a4c]">
                  {loadingTables ? <Loader2 className="h-6 w-6 animate-spin text-[#713a2e]" /> : (
                    <span className="flex max-w-xs flex-col items-center gap-2">
                      <AlertCircle className="h-6 w-6 text-[#b5452f]" />
                      {tablesError || t("bookingNoTables")}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-[#6b5146]">
              {(["AVAILABLE", "HOLD", "RESERVED"] as TableStatus[]).map((status) => (
                <span key={status} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor[status] }} />
                  {t(statusLabelKey[status])}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SELECTED_COLOR }} />
                {t("bookingSelected")}
              </span>
              {!loadingTables && !tablesError && displayTables.length > 0 && (
                <span className="ml-auto font-medium text-[#2f9e5b]">{availableCount}/{displayTables.length} {t("statusAvailable").toLowerCase()}</span>
              )}
            </div>

            {selectedTables.length > 0 && (
              <button
                type="button"
                onClick={() => openTablePhotos(selectedTables.map((table) => table.id), selectedTables)}
                className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-left text-blue-950 transition hover:border-blue-300 hover:bg-blue-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="flex -space-x-2">
                  {selectedTables.slice(0, 3).map((table) => (
                    <span key={table.id} className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-blue-200/70 ring-2 ring-blue-50">
                      {table.imageUrl ? <img src={table.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageOff className="h-4 w-4 text-blue-700/70" />}
                    </span>
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t("tablePhotosButton")}</span>
                  <span className="block truncate text-xs text-blue-900/70">{t("tablePhotosTitle")} · {selectedTables.map((table) => table.tableNumber).join(", ")}</span>
                </span>
                <Camera className="h-5 w-5 shrink-0 text-blue-700" />
              </button>
            )}
          </section>

          <form onSubmit={submitBooking} className="min-w-0 scroll-mt-24 rounded-3xl border border-[#eadcc8] bg-white p-4 shadow-sm sm:p-5" aria-labelledby="details-heading">
            <h2 id="details-heading" className="mb-4 flex items-center gap-2 text-base font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#713a2e] text-xs text-white">2</span>
              {t("bookingStepDetails")}
            </h2>

            <div className={cn("mb-4 rounded-2xl border px-4 py-3 text-sm", selectedTables.length ? "border-blue-200 bg-blue-50 text-blue-900" : "border-dashed border-[#e2cdb4] bg-[#fdf9f3] text-[#7a5a4c]")}>
              <p className="font-semibold">{selectionLabel}</p>
              <p className="mt-0.5 text-xs opacity-80">{AREAS.find((item) => item.value === area)?.label} · {form.bookingDate} · {form.startTime}–{form.endTime} · {guestCount} {t("bookingGuestLabel")}</p>
              {selectedTables.length > 0 && selectedCapacity < guestCount && <p className="mt-1 text-xs font-medium text-red-600">{t("bookingNotEnoughSeats")}</p>}
            </div>

            <div className="grid gap-3.5">
              <Field label={t("bookingCustomerName")} id="customerName" autoComplete="name" placeholder="Nguyen Van A" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} />
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label={t("bookingEmail")} id="customerEmail" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" value={form.customerEmail} onChange={(value) => setForm({ ...form, customerEmail: value })} />
                <Field label={t("bookingPhone")} id="customerPhone" type="tel" autoComplete="tel" inputMode="tel" placeholder="0912 345 678" value={form.customerPhone} onChange={(value) => setForm({ ...form, customerPhone: value })} />
              </div>
              <div>
                <Label htmlFor="endTime">{t("bookingEndTime")}</Label>
                <select
                  id="endTime"
                  value={form.endTime}
                  onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                  className="mt-1.5 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
                >
                  {endSlotsFor(form.startTime).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="note">{t("bookingNotes")}</Label>
                <Textarea className="mt-1.5 rounded-xl text-base" id="note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder={t("bookingOptional")} />
              </div>
              <div className="space-y-1.5 rounded-2xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                <p className="flex gap-2 font-medium"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("bookingNoShowNotice")}</p>
                <p className="pl-[22px]">{t("bookingLargeParty")}</p>
              </div>
              <div className={cn("flex items-start gap-3 rounded-2xl border p-3 transition-colors", confirmationError ? "border-destructive bg-destructive/5 ring-1 ring-destructive" : "border-[#eadcc8]")}>
                <Checkbox
                  id="informationConfirmed"
                  checked={informationConfirmed}
                  aria-invalid={confirmationError}
                  onCheckedChange={(checked) => {
                    setInformationConfirmed(checked === true);
                    if (checked === true) setConfirmationError(false);
                  }}
                />
                <Label htmlFor="informationConfirmed" className={cn("cursor-pointer text-sm leading-5", confirmationError && "text-destructive")}>
                  {t("bookingConfirmationLabel")} <RequiredMark />
                </Label>
              </div>
              <Button type="submit" disabled={submitting || selectedTables.length === 0} className="h-12 rounded-2xl bg-[#c0392b] text-base font-semibold text-white shadow-lg shadow-[#c0392b]/25 hover:bg-[#a93226]">
                {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CalendarCheck className="mr-2 h-5 w-5" />}
                {t("bookingContinue")}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <Dialog open={showPhotos} onOpenChange={setShowPhotos}>
        <DialogContent className="max-w-3xl overflow-hidden">
          <DialogHeader><DialogTitle>{areaName} {t("bookingPhotos")}</DialogTitle></DialogHeader>
          <Carousel key={area} opts={{ loop: areaImages.length > 1 }} className="mx-auto w-full">
            <CarouselContent>
              {(areaImages.length ? areaImages : ["/placeholder.svg"]).map((src, index) => (
                <CarouselItem key={`${src}-${index}`}>
                  <img src={src} alt={`${areaName} dining area ${index + 1}`} className="aspect-[4/3] w-full rounded-xl object-cover" />
                </CarouselItem>
              ))}
            </CarouselContent>
            {areaImages.length > 1 && (
              <>
                <CarouselPrevious className="left-3 bg-white/90 shadow-md" />
                <CarouselNext className="right-3 bg-white/90 shadow-md" />
              </>
            )}
          </Carousel>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(otpSession)} onOpenChange={(open) => !open && setOtpSession(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>{t("bookingVerifyEmail")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("bookingOtpInstruction")} <strong>{otpSession?.email}</strong>. {t("bookingOtpExpires")}</p>
          <div>
            <Label htmlFor="bookingOtp">OTP <RequiredMark /></Label>
            <Input id="bookingOtp" className="mt-1.5 h-14 rounded-2xl text-center text-2xl font-bold tracking-[0.5em]" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-11 rounded-xl bg-[#c0392b] hover:bg-[#a93226]" onClick={verifyOtp} disabled={otp.length !== 6 || submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("bookingVerifyOtp")}</Button>
            <Button className="h-11 rounded-xl" type="button" variant="outline" onClick={resendOtp}>{t("bookingResendOtp")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(result)} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></div>
            <DialogTitle className="text-center">{t("bookingSuccessTitle")}</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-2 rounded-2xl bg-[#fdf9f3] p-4 text-sm">
              <p><strong>{t("bookingCode")}:</strong> {result.bookingCode}</p>
              <p><strong>{t("bookingCustomerName")}:</strong> {result.customerName}</p>
              <p><strong>{t("bookingArea")}:</strong> {AREAS.find((item) => item.value === result.area)?.label}</p>
              <p><strong>{t("bookingTable")}:</strong> {result.tables.map((table) => table.tableNumber).join(", ")}</p>
              <p><strong>{t("bookingDateTime")}:</strong> {result.bookingDate} {result.startTime} – {result.endTime}</p>
              <p><strong>{t("bookingGuests")}:</strong> {result.numberOfGuests}</p>
              <p><strong>{t("bookingStatus")}:</strong> {t("bookingPendingApproval")}</p>
              <p className="pt-2 text-muted-foreground">{t("bookingCheckEmail")}</p>
            </div>
          )}
          {result && result.tables.length > 0 && (
            <button
              type="button"
              onClick={() => openTablePhotos(result.tables.map((table) => table.id), result.tables)}
              className="group w-full overflow-hidden rounded-2xl border border-[#eadcc8] bg-white text-left transition hover:border-[#c9a98c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713a2e]"
            >
              <span className="grid h-28 gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.min(result.tables.length, 3)}, minmax(0, 1fr))` }}>
                {result.tables.slice(0, 3).map((table) => (
                  <span key={table.id} className="relative flex items-center justify-center overflow-hidden bg-[#f3e8dc]">
                    {table.imageUrl ? <img src={table.imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <ImageOff className="h-6 w-6 text-[#b8957d]" />}
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">{table.tableNumber}</span>
                  </span>
                ))}
              </span>
              <span className="flex items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold text-[#2b1d17]">{t("bookingSeeYourTable")}</span>
                  <span className="block text-xs text-[#7a5a4c]">{t("tablePhotosTitle")}</span>
                </span>
                <Camera className="h-5 w-5 shrink-0 text-[#713a2e]" />
              </span>
            </button>
          )}
          {result && (
            <p className="flex gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-xs font-medium leading-5 text-amber-900">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("bookingNoShowNotice")}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label, id, value, onChange, type = "text", placeholder, autoComplete, inputMode,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "email" | "tel" | "text";
}) {
  return (
    <div>
      <Label htmlFor={id}>{label} <RequiredMark /></Label>
      <Input className="mt-1.5 h-12 rounded-xl text-base" id={id} type={type} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} required />
    </div>
  );
}

function RequiredMark() {
  return <span className="text-destructive" aria-hidden="true">*</span>;
}
