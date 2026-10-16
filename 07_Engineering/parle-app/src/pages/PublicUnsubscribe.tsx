import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { unsubscribeWithToken } from "@/lib/parle-admin";
import { t } from "@/lib/i18n";

/** Spec 4.5: the link in every waitlist email (after launch, parle.buzz is the app). Records the unsubscribe on load. */
export default function PublicUnsubscribe() {
  const [state, setState] = useState<"working" | "done" | "invalid" | "failed">("working");
  const [email, setEmail] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t") ?? "";
    if (!token) { setState("invalid"); return; }
    void unsubscribeWithToken(token).then((e) => { setEmail(e); setState("done"); }, (error) => setState(error?.code === "TOKEN_INVALID" ? "invalid" : "failed"));
  }, []);
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-display text-3xl font-extrabold text-primary">{t(state === "done" ? "unsubscribe.done" : state === "invalid" ? "unsubscribe.invalid" : state === "failed" ? "unsubscribe.failed" : "unsubscribe.title")}</h1>
      {state === "working" && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />{t("unsubscribe.working")}</p>}
      {state === "done" && <p className="mt-4 break-words text-base">{t("unsubscribe.doneBody", { email })}</p>}
      {state === "invalid" && <p className="mt-4 text-base">{t("unsubscribe.invalidBody")}</p>}
      {state === "failed" && <p className="mt-4 text-base">{t("unsubscribe.failedBody")}</p>}
    </main>
  );
}
