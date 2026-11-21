import { Suspense, useEffect, useLayoutEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { loadBookingPage } from "@/lib/pageLoaders";

/**
 * Shell for the public pages (home, menu, booking). The header lives here, outside the routed
 * page, so it stays mounted while navigating: no remount flicker, and it keeps showing while a
 * lazily loaded page (booking, with the Konva floor map) is still downloading.
 */
export default function PublicLayout() {
  const { pathname } = useLocation();

  // New page → start at the top before paint (query-only changes such as ?tablePhotos keep the scroll).
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Fetch the booking page in the background so the first tap on "Booking" is instant.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500));
    const handle = idle(() => { void loadBookingPage(); });
    return () => { (window.cancelIdleCallback ?? window.clearTimeout)(handle); };
  }, []);

  return (
    <div className="min-h-dvh bg-[#faf5ec]">
      <SiteHeader />
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center" role="status" aria-label="Loading">
      <Loader2 className="h-8 w-8 animate-spin text-[#713a2e]" />
    </div>
  );
}
