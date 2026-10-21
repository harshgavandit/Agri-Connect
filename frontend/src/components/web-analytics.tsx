import { useEffect, useState } from "react";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import { useLocation } from "wouter";
import { COOKIE_CONSENT_STORAGE_KEY, hasCookieConsent } from "@/lib/cookie-consent";

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  // The SDK can remain loaded after consent is withdrawn.
  if (!hasCookieConsent("analytics")) return null;

  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}

export function WebAnalytics() {
  const [enabled, setEnabled] = useState(false);
  const [path] = useLocation();

  useEffect(() => {
    const updateConsent = () => setEnabled(hasCookieConsent("analytics"));
    const onStorage = (event: StorageEvent) => {
      if (event.key === COOKIE_CONSENT_STORAGE_KEY || event.key === null) updateConsent();
    };

    updateConsent();
    window.addEventListener("agriconnect:cookie-consent-updated", updateConsent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("agriconnect:cookie-consent-updated", updateConsent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!import.meta.env.PROD || !enabled) return null;

  return <Analytics mode="production" debug={false} route={path} path={path} beforeSend={beforeSend} />;
}
