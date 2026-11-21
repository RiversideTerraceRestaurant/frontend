import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Menu from "./pages/Menu";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import { lazy, Suspense } from "react";
import { AdminIndexRedirect } from "./pages/admin/AdminLayout";
import PublicLayout from "./layouts/PublicLayout";
import { loadBookingPage } from "@/lib/pageLoaders";

// Konva (table maps) is only needed on booking pages, so load them on demand.
const Booking = lazy(loadBookingPage);
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminBookingPage = lazy(() => import("./pages/admin/AdminBookingPage"));
const AdminMenuPage = lazy(() => import("./pages/admin/AdminMenuPage"));
const AdminTablesPage = lazy(() => import("./pages/admin/AdminTablesPage"));
const pageFallback = <div className="min-h-screen" />;
import NotFound from "./pages/NotFound";
import { ChatWidget } from "@/components/ChatWidget";
import { TablePhotoViewerHost } from "@/components/TablePhotoViewer";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            {/* Public pages share one persistent header (see PublicLayout). */}
            <Route element={<PublicLayout />}>
              <Route path="/home" element={<Home />} />
              <Route path="/menu" element={<Menu />} />
              <Route path="/booking" element={<Booking />} />
            </Route>
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin" element={<AdminIndexRedirect />} />
            <Route element={<Suspense fallback={pageFallback}><AdminLayout /></Suspense>}>
              <Route path="/admin/booking" element={<Suspense fallback={pageFallback}><AdminBookingPage /></Suspense>} />
              <Route path="/admin/booking/list" element={<Suspense fallback={pageFallback}><AdminBookingPage /></Suspense>} />
              <Route path="/admin/menu" element={<Suspense fallback={pageFallback}><AdminMenuPage /></Suspense>} />
              <Route path="/admin/tables" element={<Suspense fallback={pageFallback}><AdminTablesPage /></Suspense>} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <ChatWidget />
          <TablePhotoViewerHost />
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
