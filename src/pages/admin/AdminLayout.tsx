import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarCheck, ExternalLink, LogOut, UtensilsCrossed } from "lucide-react";
import { api } from "@/lib/api";
import { adminBookingApi } from "@/lib/bookingApi";
import { useBookingRealtime } from "@/hooks/use-booking-realtime";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PushToggle } from "@/components/admin/PushToggle";

export interface AdminOutletContext { pendingCount: number }

/** Shared admin shell: checks the admin session and switches between Booking and Menu. */
export default function AdminLayout() {
  const [state, setState] = useState<"loading" | "ready">("loading");
  const [pendingCount, setPendingCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    api.session().then((session) => {
      if (!active) return;
      if (!session.user) { navigate("/auth", { replace: true }); return; }
      if (!session.isAdmin) {
        toast({ title: "Access Denied", description: "Admin access required.", variant: "destructive" });
        navigate("/home", { replace: true });
        return;
      }
      setState("ready");
    }).catch((error) => {
      if (!active) return;
      toast({ title: "Error", description: error instanceof Error ? error.message : "Unable to load dashboard", variant: "destructive" });
      navigate("/auth", { replace: true });
    });
    return () => { active = false; };
  }, [navigate, toast]);

  const loadPendingCount = useCallback(() => {
    void adminBookingApi.pendingBookingCount().then((result) => setPendingCount(result.count)).catch(() => undefined);
  }, []);
  useEffect(() => { if (state === "ready") loadPendingCount(); }, [state, loadPendingCount]);
  useBookingRealtime(loadPendingCount, state === "ready");

  const logout = async () => {
    await api.logout().catch(() => undefined);
    toast({ title: "Logged out", description: "You've been successfully logged out." });
    navigate("/home");
  };

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf5ec]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#713a2e]" />
      </div>
    );
  }

  const sections = [
    { to: "/admin/booking", label: "Booking", icon: CalendarCheck, badge: pendingCount },
    { to: "/admin/menu", label: "Menu", icon: UtensilsCrossed, badge: 0 },
  ];
  const timeMap = location.pathname === "/admin/booking";

  return (
    <div className={cn("flex flex-col bg-[#faf5ec]", timeMap ? "h-dvh" : "min-h-dvh")}>
      <header className="sticky top-0 z-50 shrink-0 border-b border-[#e6d6c2] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6">
          <div className="flex shrink-0 items-center gap-2">
            <img src="/images/restaurant/logo.webp" alt="" className="h-9 w-10 shrink-0 rounded-lg bg-white object-contain ring-1 ring-[#e6d6c2] sm:w-12" />
            <span className="hidden truncate text-sm font-semibold text-[#2b1d17] md:inline">Riverside Terrace Admin</span>
          </div>
          <nav className="mx-auto flex rounded-full bg-[#f3e8dc] p-1" aria-label="Admin sections">
            {sections.map(({ to, label, icon: Icon, badge }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => cn(
                  "relative flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition sm:gap-2 sm:px-5",
                  isActive ? "bg-[#713a2e] text-white shadow-sm" : "text-[#5b3a2e] hover:bg-white/70",
                )}
              >
                <Icon className="h-4 w-4" />{label}
                {badge > 0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-5 text-white" aria-label={`${badge} pending`}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <PushToggle />
            <a href="/home" target="_blank" rel="noreferrer" className="hidden h-9 w-9 items-center justify-center sm:flex rounded-full text-[#5b3a2e] hover:bg-[#713a2e]/10" title="View website" aria-label="View website">
              <ExternalLink className="h-4 w-4" />
            </a>
            <button onClick={() => void logout()} className="flex h-9 w-9 items-center justify-center rounded-full text-[#5b3a2e] hover:bg-[#713a2e]/10" title="Logout" aria-label="Logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <Outlet context={{ pendingCount } satisfies AdminOutletContext} />
    </div>
  );
}

/** `/admin`: send old links (?tab=, ?bookingId=) to their new homes. */
export function AdminIndexRedirect() {
  const [params] = useSearchParams();
  const tab = params.get("tab");
  const bookingId = params.get("bookingId");
  if (bookingId) return <Navigate to={`/admin/booking/list?bookingId=${encodeURIComponent(bookingId)}`} replace />;
  if (tab === "bookings") return <Navigate to="/admin/booking/list" replace />;
  if (tab && ["menu", "categories", "analytics", "knowledge"].includes(tab)) return <Navigate to={tab === "menu" ? "/admin/menu" : `/admin/menu?tab=${tab}`} replace />;
  return <Navigate to="/admin/booking" replace />;
}
