import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Send } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { currentSubscription, disablePush, enablePush, needsHomeScreen, pushApi, pushSupported, type PushConfig } from "@/lib/push";
import { cn } from "@/lib/utils";

/** Bell in the admin header: turn new-booking notifications on/off for this device. */
export function PushToggle() {
  const { toast } = useToast();
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  const refresh = async () => {
    const [nextConfig, subscription] = await Promise.all([pushApi.config().catch(() => null), currentSubscription().catch(() => null)]);
    setConfig(nextConfig);
    setSubscribed(Boolean(subscription) && Notification.permission === "granted");
  };
  useEffect(() => { if (supported) void refresh(); }, [supported]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast({ title: success });
      await refresh();
    } catch (error) {
      toast({ title: "Notifications", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const Icon = subscribed ? BellRing : supported ? Bell : BellOff;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn("relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#713a2e]/10", subscribed ? "text-emerald-700" : "text-[#5b3a2e]")} aria-label="Booking notifications" title="Booking notifications">
          <Icon className="h-4 w-4" />
          {subscribed && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl">
        <p className="font-semibold text-[#2b1d17]">New booking alerts</p>
        <p className="mt-1 text-sm text-[#7a5a4c]">Get a notification on this device whenever a guest confirms a booking request, even when this tab is closed.</p>
        <div className="mt-3 space-y-2">
          {!supported ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This browser does not support push notifications.</p>
          ) : config && !config.enabled ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Push is not configured on the server yet (VAPID keys missing).</p>
          ) : needsHomeScreen() ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">On iPhone/iPad: tap Share → <b>Add to Home Screen</b>, open the admin from that icon, then enable alerts here.</p>
          ) : subscribed ? (
            <>
              <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><BellRing className="h-4 w-4" />Alerts are on for this device.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => void act(async () => {
                  const result = await pushApi.test();
                  if (!result.accepted) throw new Error("No device accepted the test. Try turning alerts off and on again.");
                }, "Test notification sent")}>
                  <Send className="mr-1.5 h-4 w-4" />Send test
                </Button>
                <Button size="sm" variant="ghost" className="flex-1 text-red-700" disabled={busy} onClick={() => void act(disablePush, "Alerts turned off")}>
                  <BellOff className="mr-1.5 h-4 w-4" />Turn off
                </Button>
              </div>
            </>
          ) : (
            <Button className="w-full bg-[#713a2e] hover:bg-[#5e2f25]" disabled={busy || !config} onClick={() => void act(() => enablePush(config!.publicKey), "Alerts turned on")}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}Turn on alerts
            </Button>
          )}
          {config?.enabled && <p className="text-xs text-[#9a7b6c]">{config.subscriptionCount} device(s) receive alerts.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
