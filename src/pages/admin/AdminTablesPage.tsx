import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, ImageOff, ImagePlus, Loader2, RefreshCw, Trash2, Upload, Users } from "lucide-react";
import { AREAS, adminBookingApi } from "@/lib/bookingApi";
import { TABLES_QUERY_KEY, useTablePhotos } from "@/components/TablePhotoViewer";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { RestaurantArea, RestaurantTable } from "@/types/booking";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
type AreaFilter = RestaurantArea | "ALL";

/** /admin/tables: one photo per table, shown to guests when they pick tables and in booking emails. */
export default function AdminTablesPage() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [area, setArea] = useState<AreaFilter>("ALL");
  const [missingOnly, setMissingOnly] = useState(false);
  const [busy, setBusy] = useState<Record<number, "upload" | "remove">>({});
  const [removing, setRemoving] = useState<RestaurantTable | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const openTablePhotos = useTablePhotos();

  const load = useCallback(async () => {
    setState("loading");
    try {
      setTables(await adminBookingApi.tables());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(() => [...tables].sort((a, b) => {
    const byArea = AREAS.findIndex((item) => item.value === a.area) - AREAS.findIndex((item) => item.value === b.area);
    return byArea || a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true, sensitivity: "base" });
  }), [tables]);
  const visible = sorted.filter((table) => (area === "ALL" || table.area === area) && (!missingOnly || !table.imageUrl));
  const withPhoto = tables.filter((table) => table.imageUrl).length;
  const countFor = (value: AreaFilter) => {
    const list = value === "ALL" ? tables : tables.filter((table) => table.area === value);
    return `${list.filter((table) => table.imageUrl).length}/${list.length}`;
  };

  const replaceTable = (updated: RestaurantTable) => {
    setTables((current) => current.map((table) => (table.id === updated.id ? updated : table)));
    // Guests' viewer reads the public table list; refresh it so the new photo shows straight away.
    void queryClient.invalidateQueries({ queryKey: TABLES_QUERY_KEY });
  };

  const upload = async (table: RestaurantTable, file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({ title: "Photo is too large", description: "Please choose an image under 15 MB.", variant: "destructive" });
      return;
    }
    setBusy((current) => ({ ...current, [table.id]: "upload" }));
    try {
      replaceTable(await adminBookingApi.uploadTablePhoto(table.id, file));
      toast({ title: `Photo saved for ${table.tableNumber}` });
    } catch (error) {
      toast({ title: `Could not upload the photo for ${table.tableNumber}`, description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy(({ [table.id]: _done, ...rest }) => rest);
    }
  };

  const remove = async (table: RestaurantTable) => {
    setRemoving(null);
    setBusy((current) => ({ ...current, [table.id]: "remove" }));
    try {
      replaceTable(await adminBookingApi.removeTablePhoto(table.id));
      toast({ title: `Photo removed from ${table.tableNumber}` });
    } catch (error) {
      toast({ title: "Could not remove the photo", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy(({ [table.id]: _done, ...rest }) => rest);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#2b1d17]">Table photos</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#7a5a4c]">
            One photo per table, showing where it is and the view from the seat. Guests see it when they pick tables, after booking and from the link in their booking emails.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state === "ready" && (
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#5b3a2e] ring-1 ring-[#e6d6c2]">
              {withPhoto}/{tables.length} with photo
            </span>
          )}
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => void load()} disabled={state === "loading"} aria-label="Reload tables">
            {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Area">
          {([{ value: "ALL", label: "All" }, ...AREAS] as { value: AreaFilter; label: string }[]).map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={area === item.value}
              onClick={() => setArea(item.value)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                area === item.value ? "border-[#713a2e] bg-[#713a2e] text-white shadow-sm" : "border-[#eadcc8] bg-white text-[#5b3a2e] hover:border-[#c9a98c]",
              )}
            >
              {item.label}
              {state === "ready" && <span className={cn("text-xs font-medium", area === item.value ? "text-white/75" : "text-[#9a7b6b]")}>{countFor(item.value)}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={missingOnly}
          onClick={() => setMissingOnly((value) => !value)}
          className={cn(
            "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
            missingOnly ? "border-amber-400 bg-amber-50 text-amber-900" : "border-[#eadcc8] bg-white text-[#5b3a2e] hover:border-[#c9a98c]",
          )}
        >
          <ImageOff className="h-4 w-4" />Missing photo
        </button>
      </div>

      {state === "error" ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#e2cdb4] bg-white p-10 text-center text-sm text-[#7a5a4c]">
          <AlertCircle className="h-7 w-7 text-[#b5452f]" />
          Could not load the tables.
          <Button variant="outline" onClick={() => void load()}>Try again</Button>
        </div>
      ) : state === "loading" && !tables.length ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[4/3.6] animate-pulse rounded-3xl bg-[#efe3d4]" />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-3xl border border-dashed border-[#e2cdb4] bg-white p-10 text-center text-sm text-[#7a5a4c]">
          {missingOnly ? "Every table in this area has a photo." : "No tables in this area."}
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              busy={busy[table.id]}
              showArea={area === "ALL"}
              onUpload={(file) => void upload(table, file)}
              onPreview={() => openTablePhotos([table.id], [table])}
              onRemove={() => setRemoving(table)}
            />
          ))}
        </ul>
      )}

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the photo of {removing?.tableNumber}?</AlertDialogTitle>
            <AlertDialogDescription>Guests will see a "no photo yet" placeholder for this table until you upload a new one.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-red-600 hover:bg-red-700" onClick={() => removing && void remove(removing)}>Remove photo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function TableCard({
  table, busy, showArea, onUpload, onPreview, onRemove,
}: {
  table: RestaurantTable;
  busy?: "upload" | "remove";
  showArea: boolean;
  onUpload: (file: File) => void;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const areaLabel = AREAS.find((item) => item.value === table.area)?.label ?? table.area;
  const choose = () => input.current?.click();
  return (
    <li className="overflow-hidden rounded-3xl border border-[#eadcc8] bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-[#f6eee4]">
        {table.imageUrl ? (
          <button type="button" onClick={onPreview} className="group block h-full w-full focus-visible:outline-none" aria-label={`Preview the photo of ${table.tableNumber}`}>
            <img src={table.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          </button>
        ) : (
          <button type="button" onClick={choose} disabled={Boolean(busy)} className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[#9a7b6b] transition hover:bg-[#f1e5d7] hover:text-[#713a2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#713a2e]">
            <ImagePlus className="h-7 w-7" />
            <span className="text-xs font-semibold">Add photo</span>
          </button>
        )}
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/55 px-2.5 py-0.5 text-sm font-bold text-white backdrop-blur">{table.tableNumber}</span>
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/75 text-xs font-semibold text-[#713a2e] backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin" />{busy === "upload" ? "Uploading…" : "Removing…"}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 p-2 pl-3">
        <p className="min-w-0 flex-1 truncate text-xs text-[#7a5a4c]" title={`${areaLabel} · ${table.capacity} seats`}>
          {showArea && <span className="hidden font-semibold text-[#5b3a2e] lg:inline">{areaLabel} · </span>}
          <Users className="mr-0.5 inline h-3 w-3 align-[-1px]" />{table.capacity}
        </p>
        <button type="button" onClick={choose} disabled={Boolean(busy)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#713a2e] transition hover:bg-[#713a2e]/10 disabled:opacity-40" title={table.imageUrl ? "Replace photo" : "Upload photo"} aria-label={`${table.imageUrl ? "Replace" : "Upload"} the photo of ${table.tableNumber}`}>
          <Upload className="h-4 w-4" />
        </button>
        <button type="button" onClick={onPreview} className="flex h-9 w-9 items-center justify-center rounded-full text-[#713a2e] transition hover:bg-[#713a2e]/10" title="Preview as guests see it" aria-label={`Preview ${table.tableNumber} as guests see it`}>
          <Eye className="h-4 w-4" />
        </button>
        {table.imageUrl && (
          <button type="button" onClick={onRemove} disabled={Boolean(busy)} className="flex h-9 w-9 items-center justify-center rounded-full text-red-600 transition hover:bg-red-50 disabled:opacity-40" title="Remove photo" aria-label={`Remove the photo of ${table.tableNumber}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onUpload(file);
          }}
        />
      </div>
    </li>
  );
}
