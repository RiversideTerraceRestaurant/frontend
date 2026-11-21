import { useCallback, useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ChevronLeft, ChevronRight, ImageOff, MapPin, Users, X } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { AREAS, publicBookingApi } from "@/lib/bookingApi";
import { useBookingCopy } from "@/content/bookingCopy";
import type { RestaurantTable } from "@/types/booking";
import { cn } from "@/lib/utils";

/**
 * The single table-photo viewer of the site. It is mounted once (in App) and opened through the
 * `?tablePhotos=3,4` URL parameter, so the booking page, the chat, the admin "Tables" section and
 * the link in booking emails all land on the same element. One photo per table; tables without a
 * photo show a placeholder.
 */
export const TABLE_PHOTOS_PARAM = "tablePhotos";
export const TABLES_QUERY_KEY = ["reservation-tables"] as const;
const MAX_TABLES = 6;

function parseIds(value: string | null) {
  if (!value) return [];
  const ids = value.split(",").map((part) => Number(part.trim())).filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, MAX_TABLES);
}

/** Opens the shared viewer for these tables (pushes a history entry, so Back closes it). */
export function useTablePhotos() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  return useCallback((ids: number[], known?: RestaurantTable[]) => {
    const unique = [...new Set(ids)].slice(0, MAX_TABLES);
    if (!unique.length) return;
    // Seed the cache with tables the caller already has, so the photos show without a round trip.
    if (known?.length) {
      queryClient.setQueryData<RestaurantTable[]>(TABLES_QUERY_KEY, (current) => {
        const merged = new Map((current ?? []).map((table) => [table.id, table]));
        known.forEach((table) => merged.set(table.id, { ...merged.get(table.id), ...table }));
        return [...merged.values()];
      });
    }
    const params = new URLSearchParams(location.search);
    params.set(TABLE_PHOTOS_PARAM, unique.join(","));
    navigate({ pathname: location.pathname, search: `?${params}`, hash: location.hash }, { state: { ...(location.state ?? {}), tablePhotosPushed: true } });
  }, [location, navigate, queryClient]);
}

export function TablePhotoViewerHost() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const ids = useMemo(() => parseIds(params.get(TABLE_PHOTOS_PARAM)), [params]);
  const open = ids.length > 0;

  const close = () => {
    if ((location.state as { tablePhotosPushed?: boolean } | null)?.tablePhotosPushed) {
      navigate(-1);
      return;
    }
    // Opened from an email link: drop the parameter in place.
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete(TABLE_PHOTOS_PARAM);
      return next;
    }, { replace: true });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => !value && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {/* Centred with inset/margin instead of translate(-50%), so the zoom-in animation does not slide in from a corner. */}
        <DialogPrimitive.Content
          className="fixed inset-0 z-[60] m-auto h-fit w-[calc(100%-1.5rem)] max-w-3xl overflow-hidden rounded-[28px] bg-[#17110e] text-white shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200"
          aria-describedby={undefined}
        >
          {open && <TablePhotoViewer ids={ids} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TablePhotoViewer({ ids }: { ids: number[] }) {
  const { t } = useBookingCopy();
  const query = useQuery({ queryKey: TABLES_QUERY_KEY, queryFn: () => publicBookingApi.allTables(), staleTime: 60_000 });
  const byId = useMemo(() => new Map((query.data ?? []).map((table) => [table.id, table])), [query.data]);
  const tables = ids.map((id) => byId.get(id)).filter((table): table is RestaurantTable => Boolean(table));
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const update = () => setIndex(api.selectedScrollSnap());
    update();
    api.on("select", update).on("reInit", update);
    return () => { api.off("select", update).off("reInit", update); };
  }, [api]);

  const loading = !tables.length && query.isPending;
  const failed = !tables.length && query.isError;
  const current = tables[Math.min(index, Math.max(tables.length - 1, 0))];
  const areaLabel = (table: RestaurantTable) => AREAS.find((item) => item.value === table.area)?.label ?? table.locationName;

  return (
    <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
        <div className="min-w-0">
          <DialogPrimitive.Title className="text-base font-semibold sm:text-lg">{t("tablePhotosTitle")}</DialogPrimitive.Title>
          {current && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-white/65">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{areaLabel(current)}</span>
              <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{current.capacity} {t("bookingSeats")}</span>
            </p>
          )}
        </div>
        <DialogPrimitive.Close className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40" aria-label={t("tablePhotosClose")}>
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </div>

      {loading ? (
        <div className="mx-3 mb-3 aspect-[4/3] animate-pulse rounded-[22px] bg-white/10 sm:mx-4 sm:aspect-[16/10]" />
      ) : failed || !tables.length ? (
        <div className="mx-3 mb-3 flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-[22px] bg-white/5 p-6 text-center text-sm text-white/75 sm:mx-4 sm:aspect-[16/10]">
          <AlertCircle className="h-7 w-7 text-[#f6d9a8]" />
          {failed ? t("tablePhotosError") : t("tablePhotosNone")}
        </div>
      ) : (
        <>
          <div className="relative px-3 sm:px-4">
            <Carousel setApi={setApi} opts={{ loop: false }} className="w-full">
              <CarouselContent className="-ml-3">
                {tables.map((table) => (
                  <CarouselItem key={table.id} className="pl-3">
                    <TablePhoto key={table.imageUrl ?? "none"} table={table} label={`${t("bookingTable")} ${table.tableNumber}`} />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
            {tables.length > 1 && (
              <>
                <button type="button" onClick={() => api?.scrollPrev()} disabled={index === 0} className="absolute left-7 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 disabled:opacity-0 sm:flex" aria-label={t("tablePhotosPrevious")}>
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => api?.scrollNext()} disabled={index >= tables.length - 1} className="absolute right-7 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 disabled:opacity-0 sm:flex" aria-label={t("tablePhotosNext")}>
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto" role="tablist" aria-label={t("tablePhotosTitle")}>
              {tables.map((table, position) => (
                <button
                  key={table.id}
                  type="button"
                  role="tab"
                  aria-selected={position === index}
                  onClick={() => api?.scrollTo(position)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    position === index ? "bg-[#f6d9a8] text-[#3b1d15]" : "bg-white/10 text-white/80 hover:bg-white/15",
                  )}
                >
                  {table.tableNumber}
                  {!table.imageUrl && <ImageOff className="h-3.5 w-3.5 opacity-60" aria-label={t("tablePhotoMissing")} />}
                </button>
              ))}
            </div>
            {tables.length > 1 && (
              <span className="shrink-0 text-xs tabular-nums text-white/55" aria-live="polite">{index + 1}/{tables.length} · {t("tablePhotosSwipe")}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TablePhoto({ table, label }: { table: RestaurantTable; label: string }) {
  const { t } = useBookingCopy();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = !failed ? table.imageUrl : null;
  return (
    <figure className="relative aspect-[4/3] overflow-hidden rounded-[22px] bg-[#2a1f1a] sm:aspect-[16/10]">
      {src ? (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-white/10" />}
          <img
            src={src}
            alt={`${label} – ${t("tablePhotosTitle")}`}
            className={cn("h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            draggable={false}
          />
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_20%,#4a2a20,transparent_60%),linear-gradient(135deg,#2a1f1a,#3b2219)] p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10"><ImageOff className="h-6 w-6 text-[#f6d9a8]" /></span>
          <p className="text-sm font-semibold">{t("tablePhotoMissing")}</p>
          <p className="max-w-xs text-xs text-white/60">{t("tablePhotoMissingHint")}</p>
        </div>
      )}
      <figcaption className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-sm font-semibold text-white backdrop-blur">
        {label}
      </figcaption>
    </figure>
  );
}
