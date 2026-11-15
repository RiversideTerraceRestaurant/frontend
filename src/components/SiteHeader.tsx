import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { CalendarCheck, LayoutDashboard, LogIn, LogOut, Menu as MenuIcon, X } from "lucide-react";
import { api, type Session } from "@/lib/api";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useBookingCopy } from "@/content/bookingCopy";
import { cn } from "@/lib/utils";

/** One header for every public page (home, menu, booking). */
export function SiteHeader({ className }: { className?: string }) {
  const { t } = useBookingCopy();
  const [user, setUser] = useState<Session["user"]>(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const refresh = () => { api.session().then((session) => setUser(session.user)).catch(() => setUser(null)); };
    refresh();
    window.addEventListener("authchange", refresh);
    return () => window.removeEventListener("authchange", refresh);
  }, []);
  // Close the mobile menu after navigating.
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    navigate("/home");
  };
  const links = [
    { to: "/home", label: t("navHome") },
    { to: "/menu", label: t("navMenu") },
    { to: "/booking", label: t("navBooking") },
  ];
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
      isActive ? "bg-[#713a2e] !text-white shadow-sm" : "!text-[#4a2f26] hover:bg-[#713a2e]/10",
    );

  return (
    <header className={cn("sticky top-0 z-50 border-b border-[#e6d6c2] bg-[#faf5ec]/90 backdrop-blur-md supports-[backdrop-filter]:bg-[#faf5ec]/75", className)}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-[72px] sm:px-6">
        <Link to="/home" className="flex shrink-0 items-center gap-3" aria-label="Riverside Terrace — Home">
          <span className="block h-11 w-[66px] overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#e6d6c2] sm:h-12 sm:w-[72px]">
            <img src="/images/restaurant/logo.webp" alt="" className="h-full w-full object-contain" />
          </span>
          <span className="hidden flex-col leading-tight lg:flex">
            <span className="text-[15px] font-semibold tracking-tight !text-[#2f6b3a]">Riverside Terrace</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] !text-[#b5452f]">Restaurant · Da Nang</span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((link) => <NavLink key={link.to} to={link.to} className={linkClass}>{link.label}</NavLink>)}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-3">
          <div className="[&_[role=combobox]]:h-10 [&_[role=combobox]]:rounded-full [&_[role=combobox]]:border-[#e6d6c2] [&_[role=combobox]]:bg-white/80">
            <LanguageSelector />
          </div>
          {user ? (
            <div className="hidden items-center gap-1 md:flex">
              <button onClick={() => navigate("/admin")} className="flex h-10 items-center gap-2 rounded-full px-3 text-sm text-[#4a2f26] hover:bg-[#713a2e]/10" title={user.email}>
                <LayoutDashboard className="h-4 w-4" />{t("navDashboard")}
              </button>
              <button onClick={() => void logout()} className="flex h-10 w-10 items-center justify-center rounded-full text-[#4a2f26] hover:bg-[#713a2e]/10" aria-label={t("navLogout")} title={t("navLogout")}>
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => navigate("/auth")} className="hidden h-10 w-10 items-center justify-center rounded-full text-[#4a2f26] hover:bg-[#713a2e]/10 md:flex" aria-label={t("navLogin")} title={t("navLogin")}>
              <LogIn className="h-4 w-4" />
            </button>
          )}
          <Link to="/booking" className="hidden h-10 items-center gap-2 rounded-full bg-[#c0392b] px-4 text-sm font-semibold !text-white shadow-md shadow-[#c0392b]/25 transition hover:bg-[#a93226] hover:shadow-lg lg:flex">
            <CalendarCheck className="h-4 w-4" />{t("homeBook")}
          </Link>
          <button
            onClick={() => setOpen((value) => !value)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#4a2f26] hover:bg-[#713a2e]/10 md:hidden"
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="site-mobile-menu" className="border-t border-[#e6d6c2] bg-[#faf5ec] px-4 pb-5 pt-3 shadow-lg md:hidden">
          <nav className="grid gap-1" aria-label="Main">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} className={({ isActive }) => cn("rounded-2xl px-4 py-3 text-base font-medium", isActive ? "bg-[#713a2e] !text-white" : "!text-[#4a2f26] active:bg-[#713a2e]/10")}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/booking" className="mt-3 flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#c0392b] text-base font-semibold !text-white shadow-md">
            <CalendarCheck className="h-5 w-5" />{t("homeBook")}
          </Link>
          <div className="mt-3 flex gap-2 text-sm">
            {user ? (
              <>
                <button onClick={() => navigate("/admin")} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#e6d6c2] bg-white"><LayoutDashboard className="h-4 w-4" />{t("navDashboard")}</button>
                <button onClick={() => void logout()} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#e6d6c2] bg-white"><LogOut className="h-4 w-4" />{t("navLogout")}</button>
              </>
            ) : (
              <button onClick={() => navigate("/auth")} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#e6d6c2] bg-white"><LogIn className="h-4 w-4" />{t("navLogin")}</button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
