import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  ChefHat,
  Clock3,
  Users,
  ChevronDown,
  Leaf,
  Loader2,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  api,
  type ChatAction,
  type ChatBooking,
  type ChatBookingRequest,
  type ChatMessage,
  type ChatReply,
  type Preferences,
} from "@/lib/api";
import type { MenuItem } from "@/type/type";
import { chatCopy } from "./chatCopy";
import { restaurantChatCopy } from "./restaurantChatCopy";
import { cn } from "@/lib/utils";
import { useBookingCopy } from "@/content/bookingCopy";
import { MAX_ONLINE_GUESTS, defaultSearch, restaurantNow, slotsOn } from "@/lib/bookingSlots";
import "./chat-widget.css";

interface Message extends ChatMessage {
  id: number;
  items?: ChatReply["items"];
  mode?: ChatReply["mode"];
  filters?: ChatReply["appliedFilters"];
  booking?: ChatBooking | null;
}
const defaults: Preferences = {
  diet: "any",
  maxPrice: null,
  mild: false,
  avoid: [],
};

export function ChatWidget() {
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const restaurant = location.pathname !== "/menu";
  const r = restaurantChatCopy[language];
  const { t: tb } = useBookingCopy();
  const t = {
    ...(restaurant ? { ...chatCopy(language), ...r } : chatCopy(language)),
    title: "RTR AI",
    open: "RTR AI",
  };
  const onSelectItem = (item: MenuItem) =>
    navigate(
      `/menu?${new URLSearchParams({ item: item.id, search: item.name, category: item.category_id || "all" })}`,
    );
  const [open, setOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [avoidText, setAvoidText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<{
    content: string;
    action: ChatAction;
    booking?: ChatBookingRequest;
  } | null>(null);
  const [sent, setSent] = useState(0);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availability, setAvailability] = useState(() => ({ ...defaultSearch(), guests: 2 }));
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const sequence = useRef(0);
  const languageRef = useRef(language);
  languageRef.current = language;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = theme?.content;
    const mobile = window.matchMedia("(max-width: 639px), (max-width: 1023px) and (hover: none) and (pointer: coarse)");
    const updateTheme = () => {
      if (theme) theme.content = mobile.matches ? "#713a2e" : previousTheme ?? "";
    };
    updateTheme();
    mobile.addEventListener("change", updateTheme);
    return () => {
      mobile.removeEventListener("change", updateTheme);
      if (theme && previousTheme !== undefined) theme.content = previousTheme;
    };
  }, [open]);
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      panelRef.current?.style.setProperty(
        "--rtr-ai-viewport-height",
        `${viewport.height}px`,
      );
      panelRef.current?.style.setProperty(
        "--rtr-ai-viewport-bottom",
        `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
      );
      panelRef.current?.setAttribute(
        "data-keyboard-open",
        String(window.innerHeight - viewport.height > 150),
      );
      if (panelRef.current?.contains(document.activeElement)) {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
      }
    };
    const frame = requestAnimationFrame(update);
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      bodyRef.current?.scrollTo({
        top: bodyRef.current.scrollHeight,
        behavior: "smooth",
      });
  }, [messages, loading, error, open]);
  const activeFilters =
    Number(preferences.diet !== "any") +
    Number(preferences.maxPrice !== null) +
    Number(preferences.mild) +
    Number(Boolean(avoidText.trim()));

  async function send(
    content: string,
    action: ChatAction = "chat",
    retry = false,
    booking?: ChatBookingRequest,
  ) {
    if (loading || !content.trim() || sent >= 20) return;
    const userMessage: Message = {
      id: ++sequence.current,
      role: "user",
      content: content.trim(),
    };
    const history = retry ? messages : [...messages, userMessage];
    if (!retry) setMessages(history);
    setInput("");
    setLoading(true);
    setError("");
    setFailed(null);
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      const filters = {
        ...preferences,
        avoid: avoidText
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 10),
      };
      const conversation = history.slice(-11).map(({ role, content }) => ({
        role,
        content: content.slice(0, 1000),
      }));
      const response = await api.chat(
        conversation,
        language,
        filters,
        action,
        requestController.signal,
        restaurant ? "home" : "menu",
        conversationId.current,
        booking,
      );
      if (requestController.signal.aborted) return;
      conversationId.current = response.conversationId;
      // Respect a manual language selection made while this request was pending.
      if (response.language && languageRef.current === language) {
        setLanguage(response.language);
      }
      setMessages((current) => [
        ...current,
        {
          id: ++sequence.current,
          role: "assistant",
          content: response.reply,
          items: response.items,
          mode: response.mode,
          filters: response.appliedFilters,
          booking: response.booking,
        },
      ]);
      setSent((count) => count + 1);
    } catch (error) {
      if (requestController.signal.aborted) return;
      setError(error instanceof Error ? error.message : t.error);
      setFailed({ content, action, booking });
    } finally {
      if (
        !requestController.signal.aborted &&
        controller.current === requestController
      )
        setLoading(false);
    }
  }
  const reset = () => {
    controller.current?.abort();
    conversationId.current = undefined;
    setMessages([]);
    setError("");
    setFailed(null);
    setSent(0);
    setInput("");
    setLoading(false);
  };
  const filterLabels = (filters?: ChatReply["appliedFilters"]) => {
    if (!filters) return [];
    const diets = { vegetarian: t.vegetarian, vegan: t.vegan, gluten_free: t.gluten, dairy_free: t.dairy };
    const alcohol = {
      en: ["Alcohol-free drinks", "Alcoholic drinks"], vi: ["Đồ uống không cồn", "Đồ uống có cồn"],
      ko: ["무알코올 음료", "주류"], ja: ["ノンアルコール", "アルコール飲料"],
      cn: ["无酒精饮品", "含酒精饮品"], ru: ["Безалкогольные напитки", "Алкогольные напитки"],
      kz: ["Алкогольсіз сусындар", "Алкогольді сусындар"], es: ["Sin alcohol", "Con alcohol"],
      fr: ["Sans alcool", "Avec alcool"], it: ["Analcolici", "Alcolici"],
    };
    return [
      ...filters.diets.map(diet => diets[diet]),
      ...(filters.maxPrice !== null ? [`${t.budget}: ≤ ${filters.maxPrice.toLocaleString("vi-VN")} ₫`] : []),
      ...(filters.mild ? [t.mild] : []),
      ...(filters.avoid.length ? [`${t.avoid}: ${filters.avoid.join(", ")}`] : []),
      ...(filters.alcohol !== "any" ? [alcohol[language][filters.alcohol === "none" ? 0 : 1]] : []),
    ];
  };
  const checkAvailability = (request: ChatBookingRequest & { date: string; time: string; guests: number }) => {
    setShowAvailability(false);
    const when = new Intl.DateTimeFormat(language === "cn" ? "zh-CN" : language, { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${request.date}T00:00:00Z`));
    void send(`${tb("chatCheckTables")}: ${when} · ${request.time} · ${request.guests} ${tb("bookingGuestLabel")}`, "availability", false, request);
  };
  const openBooking = (booking: ChatBooking, option?: ChatBooking["options"][number]) => {
    const query = new URLSearchParams({ date: booking.date, time: booking.time, guests: String(booking.guests) });
    if (option) {
      query.set("area", option.area);
      query.set("tables", option.tables.map((table) => table.id).join(","));
    } else query.set("find", "1");
    setOpen(false);
    navigate(`/booking?${query}`);
  };
  const quick = restaurant
    ? [
        { label: r.location, action: "chat" as const },
        { label: r.spaces, action: "chat" as const },
        { label: r.booking, action: "chat" as const },
      ]
    : [
        {
          label: t.veg,
          action: "vegetarian" as const,
          icon: <Leaf className="h-3.5 w-3.5" />,
        },
        { label: t.notSpicy, action: "mild" as const },
        { label: t.popular, action: "popular" as const },
      ];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {createPortal(
        <DialogTrigger asChild>
          <Button
            className={cn(
              "rtr-ai-launcher fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[49] h-12 gap-2 rounded-full border px-4 text-sm font-semibold shadow-xl shadow-[#713a2e]/30 sm:h-14 sm:px-5",
              "right-4 border-white/20 bg-gradient-to-r from-[#5e2f25] to-[#b5452f] text-white hover:brightness-110 sm:right-6",
              location.pathname === "/home" && "rtr-home-assistant",
              // Sit above the booking page's sticky "Continue" bar on phones.
              location.pathname === "/booking" && "max-lg:bottom-[calc(5.25rem+env(safe-area-inset-bottom))]",
            )}
            aria-label={t.open}
          >
            <span className="relative flex">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#713a2e]" />
            </span>
            <span className="whitespace-normal leading-4">{t.open}</span>
          </Button>
        </DialogTrigger>,
        document.body,
      )}
      <DialogContent
        ref={panelRef}
        onOpenAutoFocus={(event) => event.preventDefault()}
        overlayClassName="rtr-ai-overlay"
        className="rtr-ai-panel flex flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-2xl sm:rounded-3xl [&>button]:hidden"
      >
        <header className="rtr-ai-header relative shrink-0 overflow-hidden bg-gradient-to-br from-[#5e2f25] via-[#7d3d2f] to-[#b5452f] px-5 pb-5 pt-6 text-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-[#f6d9a8]/20 blur-2xl" />
          <div className="rtr-ai-header-row flex items-center gap-3">
            <div className="rtr-ai-avatar relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 shadow-inner">
              <ChefHat className="h-6 w-6" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#713a2e]" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                {t.title}
              </DialogTitle>
              <DialogDescription className="rtr-ai-subtitle mt-1 text-xs leading-relaxed text-white/75">
                {t.subtitle}
              </DialogDescription>
            </div>
            <button
              onClick={reset}
              className="rtr-ai-header-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2"
              aria-label={t.reset}
              title={t.reset}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <DialogClose asChild>
              <button
                className="rtr-ai-header-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2"
                aria-label={t.close}
              >
                <X className="h-5 w-5" />
              </button>
            </DialogClose>
          </div>
        </header>
        {!restaurant && (
          <div className="shrink-0 border-b bg-muted/30">
            <button
              className="flex min-h-12 w-full items-center gap-2 px-5 text-left text-sm font-medium"
              aria-expanded={showFilters}
              aria-controls="chat-preferences"
              onClick={() => setShowFilters((value) => !value)}
            >
              <SlidersHorizontal className="h-4 w-4 text-[#9a6150]" />
              {t.filters}
              {activeFilters > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#713a2e] px-1 text-[10px] text-white">
                  {activeFilters}
                </span>
              )}
              <ChevronDown
                className={`ml-auto h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
              />
            </button>
            {showFilters && (
              <div
                id="chat-preferences"
                className="max-h-[30dvh] space-y-3 overflow-y-auto px-5 pb-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-xs text-muted-foreground">
                    <span>{t.diet}</span>
                    <select
                      value={preferences.diet}
                      onChange={(event) =>
                        setPreferences((value) => ({
                          ...value,
                          diet: event.target.value as Preferences["diet"],
                        }))
                      }
                      className="h-10 w-full rounded-xl border bg-background px-2 text-sm text-foreground"
                    >
                      <option value="any">{t.any}</option>
                      <option value="vegetarian">{t.vegetarian}</option>
                      <option value="vegan">{t.vegan}</option>
                      <option value="gluten_free">{t.gluten}</option>
                      <option value="dairy_free">{t.dairy}</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs text-muted-foreground">
                    <span>{t.budget}</span>
                    <select
                      value={preferences.maxPrice ?? ""}
                      onChange={(event) =>
                        setPreferences((value) => ({
                          ...value,
                          maxPrice: event.target.value
                            ? Number(event.target.value)
                            : null,
                        }))
                      }
                      className="h-10 w-full rounded-xl border bg-background px-2 text-sm text-foreground"
                    >
                      <option value="">{t.noBudget}</option>
                      {[100000, 200000, 300000, 500000].map((price) => (
                        <option key={price} value={price}>
                          ≤ {price.toLocaleString("vi-VN")} ₫
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.mild}
                    onChange={(event) =>
                      setPreferences((value) => ({
                        ...value,
                        mild: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[#713a2e]"
                  />
                  {t.mild}
                </label>
                <label className="block space-y-1.5 text-xs text-muted-foreground">
                  <span>{t.avoid}</span>
                  <input
                    value={avoidText}
                    onChange={(event) => setAvoidText(event.target.value)}
                    maxLength={300}
                    placeholder={t.avoidPlaceholder}
                    className="h-10 w-full rounded-xl border bg-background px-3 text-base text-foreground"
                  />
                </label>
                <Button
                  disabled={loading || sent >= 20}
                  onClick={() => {
                    setShowFilters(false);
                    void send(t.prompt, "suggest");
                  }}
                  className="w-full rounded-xl bg-[#713a2e] text-white hover:bg-[#572b22]"
                >
                  {t.suggest}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
        <div
          ref={bodyRef}
          className="rtr-ai-messages min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-gradient-to-b from-muted/20 to-background px-4 py-5"
        >
          {!messages.length && (
            <div className="rtr-ai-welcome px-2 pb-1 pt-5 text-center">
              <div className="rtr-ai-welcome-icon mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f3e8df] text-[#713a2e]">
                <Sparkles className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold tracking-tight">
                {t.welcome}
              </h3>
              <p className="mx-auto mt-3 max-w-[290px] text-sm leading-6 text-muted-foreground">
                {t.intro}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button
                  disabled={loading}
                  onClick={() => setShowAvailability((value) => !value)}
                  aria-expanded={showAvailability}
                  className="flex min-h-11 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#713a2e] to-[#b5452f] px-4 text-xs font-semibold text-white shadow-md shadow-[#713a2e]/20 transition hover:brightness-110"
                >
                  <CalendarCheck className="h-3.5 w-3.5" />
                  {tb("chatCheckTables")}
                </button>
                {quick.map((item) => (
                  <button
                    key={item.label}
                    disabled={loading}
                    onClick={() => void send(item.label, item.action)}
                    className="flex min-h-11 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:border-[#9a6150] hover:text-[#713a2e]"
                  >
                    {"icon" in item && item.icon}
                    {item.label}
                    <ArrowRight className="h-3.5 w-3.5 opacity-50" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {showAvailability && (
            <form
              onSubmit={(event) => { event.preventDefault(); checkAvailability(availability); }}
              className="rtr-ai-availability mx-1 space-y-2 rounded-3xl border border-[#eadcc8] bg-white p-3 shadow-lg shadow-[#713a2e]/10"
            >
              <p className="flex items-center gap-2 px-1 text-sm font-semibold text-[#713a2e]"><CalendarCheck className="h-4 w-4" />{tb("chatCheckTables")}</p>
              <label className="flex h-11 items-center gap-2 rounded-2xl border border-[#eadcc8] bg-[#fdf9f3] px-3">
                <CalendarDays className="h-4 w-4 text-[#b5452f]" />
                <span className="sr-only">{tb("searchDate")}</span>
                <input type="date" min={restaurantNow().date} value={availability.date} onChange={(event) => {
                  const date = event.target.value || restaurantNow().date;
                  const slots = slotsOn(date);
                  setAvailability((value) => ({ ...value, date, time: slots.includes(value.time) ? value.time : slots[0] ?? value.time }));
                }} className="min-w-0 flex-1 bg-transparent text-base outline-none" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex h-11 items-center gap-2 rounded-2xl border border-[#eadcc8] bg-[#fdf9f3] px-3">
                  <Clock3 className="h-4 w-4 shrink-0 text-[#b5452f]" />
                  <span className="sr-only">{tb("searchTime")}</span>
                  <select value={availability.time} onChange={(event) => setAvailability((value) => ({ ...value, time: event.target.value }))} className="min-w-0 flex-1 bg-transparent text-base outline-none">
                    {slotsOn(availability.date).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                  </select>
                </label>
                <label className="flex h-11 items-center gap-2 rounded-2xl border border-[#eadcc8] bg-[#fdf9f3] px-3">
                  <Users className="h-4 w-4 shrink-0 text-[#b5452f]" />
                  <span className="sr-only">{tb("searchGuests")}</span>
                  <select value={availability.guests} onChange={(event) => setAvailability((value) => ({ ...value, guests: Number(event.target.value) }))} className="min-w-0 flex-1 bg-transparent text-base outline-none">
                    {Array.from({ length: MAX_ONLINE_GUESTS }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {tb("bookingGuestLabel")}</option>)}
                  </select>
                </label>
              </div>
              <Button type="submit" disabled={loading || sent >= 20} className="h-11 w-full rounded-2xl bg-[#c0392b] font-semibold text-white hover:bg-[#a93226]">
                {tb("chatCheck")}<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          )}
          <div
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            className="space-y-5"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user" ? "ml-9 flex justify-end" : "mr-3"
                }
              >
                <div
                  className={`max-w-full ${message.role === "user" ? "rounded-3xl rounded-br-md bg-gradient-to-br from-[#713a2e] to-[#9c4535] px-4 py-3 text-white shadow-md shadow-[#713a2e]/15" : "w-full rounded-3xl rounded-tl-md border border-[#efe2d2] bg-white px-4 py-3 shadow-sm"}`}
                >
                  {message.role === "assistant" && (
                    <span className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a6150]">
                      <Sparkles className="h-3 w-3" />
                      RTR AI{" "}
                      {message.mode === "filters"
                        ? `· ${t.fallback}`
                        : message.mode === "unavailable"
                          ? `· ${t.unavailable}`
                          : ""}
                    </span>
                  )}
                  {message.role === "assistant" && filterLabels(message.filters).length > 0 && (
                    <div aria-label={t.filters} className="mb-3 flex flex-wrap gap-1.5">
                      {filterLabels(message.filters).map(label => (
                        <span key={label} className="rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] leading-4 text-muted-foreground">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {/* The cards below list each area, so drop the duplicate bullet lines. */}
                    {message.booking?.options.length
                      ? message.content.split("\n").filter((line) => !line.startsWith("• ")).join("\n").replace(/\n{3,}/g, "\n\n")
                      : message.content}
                  </p>
                  {message.booking && (
                    <div className="mt-3 space-y-2">
                      {message.booking.options.map((option) => (
                        <div key={option.area} className="flex items-center gap-3 rounded-2xl border border-[#eadcc8] bg-[#fdf9f3] p-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-lg font-bold text-emerald-800" title={`${option.freeCount} ${tb("statusAvailable")}`}>
                            {option.freeCount}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[#2b1d17]">{option.label}</p>
                            <p className="truncate text-xs text-[#7a5a4c]">{option.freeCount} {tb("statusAvailable").toLowerCase()} · {option.tables.map((table) => table.tableNumber).join(" + ")} · {message.booking!.time}</p>
                          </div>
                          <button
                            onClick={() => openBooking(message.booking!, option)}
                            className="shrink-0 rounded-full bg-[#c0392b] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#a93226]"
                          >
                            {tb("chatBookThis")}
                          </button>
                        </div>
                      ))}
                      {!message.booking.options.length && message.booking.nextDate && (
                        <button
                          disabled={loading}
                          onClick={() => checkAvailability({ date: message.booking!.nextDate!, time: message.booking!.time, guests: message.booking!.guests, ...(message.booking!.seating ? { seating: message.booking!.seating } : {}) })}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#c9a98c] bg-white px-3 py-2.5 text-sm font-semibold text-[#713a2e] hover:bg-[#fdf9f3]"
                        >
                          <CalendarDays className="h-4 w-4" />{tb("chatCheck")} {message.booking.nextDate}
                        </button>
                      )}
                      {message.booking.options.length > 0 && (
                        <button onClick={() => openBooking(message.booking!)} className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-[#713a2e] underline-offset-4 hover:underline">
                          {tb("findTable")}<ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  {Boolean(message.items?.length) && (
                    <div className="mt-3 space-y-2">
                      {message.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setOpen(false);
                            onSelectItem(item);
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-[#9a6150] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#713a2e]"
                        >
                          {item.thumbnail_url || item.image_url ? (
                            <img
                              src={item.thumbnail_url || item.image_url || ""}
                              alt=""
                              loading="lazy"
                              className="h-16 w-16 shrink-0 rounded-xl object-cover"
                            />
                          ) : (
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted text-[#9a6150]">
                              <ChefHat className="h-7 w-7" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold leading-5">
                              {item.name}
                            </span>
                            <span className="mt-1 block text-sm font-semibold text-[#9a6150]">
                              {item.price_with_vat.toLocaleString("vi-VN")} ₫{" "}
                              <span className="text-[10px] font-normal text-muted-foreground">
                                {t.vat}
                              </span>
                            </span>
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {loading && (
            <div
              role="status"
              className="flex items-center gap-2 py-2 text-xs text-muted-foreground"
            >
              <span className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-[#efe2d2] bg-white px-3 py-2.5 shadow-sm" aria-hidden="true">
                <span className="rtr-ai-dot" /><span className="rtr-ai-dot" /><span className="rtr-ai-dot" />
              </span>
              <Loader2 className="sr-only" />
              {t.thinking}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"
            >
              <p>{error}</p>
              {failed && (
                <button
                  onClick={() => void send(failed.content, failed.action, true, failed.booking)}
                  className="mt-2 min-h-9 font-semibold underline underline-offset-4"
                >
                  {t.retry}
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="rtr-ai-footer shrink-0 border-t bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {sent >= 20 ? (
            <p
              role="status"
              className="mb-3 text-center text-xs text-muted-foreground"
            >
              {t.limit}
            </p>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-1.5 rounded-2xl border bg-muted/20 p-1.5 focus-within:border-[#9a6150] focus-within:ring-2 focus-within:ring-[#9a6150]/10"
          >
            <button
              type="button"
              onClick={() => { setShowAvailability((value) => !value); requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" })); }}
              aria-expanded={showAvailability}
              aria-label={tb("chatCheckTables")}
              title={tb("chatCheckTables")}
              className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition", showAvailability ? "bg-[#713a2e] text-white" : "text-[#713a2e] hover:bg-[#713a2e]/10")}
            >
              <CalendarCheck className="h-5 w-5" />
            </button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              maxLength={1000}
              disabled={loading || sent >= 20}
              aria-label={t.placeholder}
              placeholder={t.placeholder}
              className="max-h-24 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-base leading-5 outline-none placeholder:text-xs placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || loading || sent >= 20}
              aria-label={t.send}
              className="h-11 w-11 shrink-0 rounded-xl bg-[#713a2e] text-white hover:bg-[#572b22]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-2.5 text-center text-[10px] leading-4 text-muted-foreground">
            {t.note}
          </p>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
