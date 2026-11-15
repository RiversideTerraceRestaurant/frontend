import { lazy, Suspense } from "react";
import { NavLink, useLocation, useOutletContext } from "react-router-dom";
import { Clock3, ListChecks } from "lucide-react";
import { AdminBookings } from "@/components/admin/AdminBookings";
import { AuthProvider as TimeMapAuthProvider } from "@/features/time-map/hooks/use-auth";
import type { AdminOutletContext } from "@/pages/admin/AdminLayout";
import { cn } from "@/lib/utils";

// Konva and html2canvas are heavy; load the time map on demand.
const TimeMap = lazy(() => import("@/features/time-map/pages/Index"));

/** /admin/booking (time map, default) and /admin/booking/list (reservation inbox). */
export default function AdminBookingPage() {
  const { pendingCount } = useOutletContext<AdminOutletContext>();
  const { pathname } = useLocation();
  const list = pathname.startsWith("/admin/booking/list");
  const tabs = [
    { to: "/admin/booking", label: "Time Map", icon: Clock3, end: true, badge: 0 },
    { to: "/admin/booking/list", label: "Reservations", icon: ListChecks, end: false, badge: pendingCount },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[#eadcc8] bg-[#faf5ec]">
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 sm:px-6" aria-label="Booking views">
          {tabs.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                "flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition",
                isActive ? "border-[#c0392b] text-[#2b1d17]" : "border-transparent text-[#7a5a4c] hover:text-[#2b1d17]",
              )}
            >
              <Icon className="h-4 w-4" />{label}
              {badge > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-5 text-white">{badge > 99 ? "99+" : badge}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
      {list ? (
        <main className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6"><AdminBookings /></main>
      ) : (
        <main className="min-h-0 flex-1 overflow-hidden">
          <TimeMapAuthProvider isAdmin>
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading time map…</div>}>
              <TimeMap embedded />
            </Suspense>
          </TimeMapAuthProvider>
        </main>
      )}
    </div>
  );
}
