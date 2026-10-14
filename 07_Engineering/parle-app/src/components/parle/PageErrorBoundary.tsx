import { Component, type ReactNode } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "@/lib/i18n";

interface PageErrorBoundaryProps {
  children: ReactNode;
}

interface PageErrorBoundaryState {
  hasError: boolean;
}

export function PageErrorFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F8FB] px-4 py-12">
      <section
        role="alert"
        aria-labelledby="page-error-heading"
        className="w-full max-w-lg rounded-[2rem] border border-primary/10 bg-white p-7 text-center shadow-[0_24px_72px_-48px_rgba(30,58,138,0.4)] sm:p-10"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#A13F36]">
          <AlertCircle aria-hidden="true" className="h-6 w-6" />
        </div>
        <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#C64D43]">Parle · Learner space</p>
        <h1 id="page-error-heading" className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-[-0.04em] text-primary sm:text-3xl">
          {t("common.pageError")}
        </h1>
        <Link to="/learner" className="parle-button-primary mt-7 w-full justify-center sm:w-auto">
          {t("common.backToToday")}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: unknown): PageErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <PageErrorFallback />;
    return this.props.children;
  }
}
