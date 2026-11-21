"use client";

import { useEffect, useState } from "react";
import { Download, WifiOff } from "lucide-react";

type DeferredPrompt = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * PwaInstall — mounts the install-to-homescreen button and an offline indicator
 * in the site navbar. Registers the service worker in production only (so dev
 * hot-reload is never cached) and triggers the warm-up so lessons work offline.
 */
export function PwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<DeferredPrompt | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [cacheStatus, setCacheStatus] = useState<"idle" | "warming" | "ready">("idle");

  useEffect(() => {
    const supportsSW = "serviceWorker" in navigator;
    const prod = process.env.NODE_ENV === "production";

    const updateOnline = () => setIsOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    if (prod && supportsSW) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(async (reg) => {
          const onMessage = (event: MessageEvent) => {
            if (event.data?.type === "PWA_STATUS") {
              setCacheStatus(event.data.status ?? "warming");
            }
          };
          navigator.serviceWorker.addEventListener("message", onMessage);

          const send = (type: string) =>
            navigator.serviceWorker.controller?.postMessage({ type });

          send("GET_STATUS");
          send("WARM");

          if (reg.active && !navigator.serviceWorker.controller) {
            navigator.serviceWorker.addEventListener("controllerchange", () => send("WARM"));
          }

          return () => navigator.serviceWorker.removeEventListener("message", onMessage);
        })
        .catch(() => {});
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as unknown as DeferredPrompt);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    });

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", () => setIsInstalled(true));
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
  };

  const canInstall = !!installPrompt && !isInstalled;
  if (isInstalled) return null;
  if (!canInstall && isOnline && cacheStatus !== "warming") return null;

  if (canInstall) {
    return (
      <button
        type="button"
        onClick={install}
        aria-label="Install app (အက်ပ်ထည့်သွင်းရန်)"
        title="App Install — အက်ပ်ထည့်သွင်းရန်"
        className="btn btn-icon btn-ghost relative"
      >
        <Download className="h-5 w-5" />
        <span
          className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[#00ffff]"
          aria-hidden="true"
        />
      </button>
    );
  }

  if (!isOnline) {
    return (
      <span
        className="flex h-9 w-9 items-center justify-center text-red-500"
        title="အော့ဖ်လိုင်း — သင်ခန်းစာများကို ဆက်ဖတ်နိုင်ပါသည်"
      >
        <WifiOff className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span
      className="flex h-9 w-9 items-center justify-center"
      title="Preparing offline lessons… (အော့ဖ်လိုင်းသင်ခန်းစာများ ပြင်ဆင်နေသည်)"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#00ffff]" aria-hidden="true" />
    </span>
  );
}