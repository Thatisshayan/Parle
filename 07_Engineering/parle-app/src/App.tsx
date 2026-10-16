import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PageErrorBoundary } from "@/components/parle/PageErrorBoundary";
import Index from "@/pages/Index";
import Onboarding from "@/pages/Onboarding";
import PlacementTest from "@/pages/PlacementTest";
import LevelCheck from "@/pages/LevelCheck";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import PublicUnsubscribe from "@/pages/PublicUnsubscribe";
import RoleShell from "@/pages/RoleShell";
import Settings from "@/pages/Settings";
import LegalPage from "@/pages/LegalPage";
import PublicInformationPage from "@/pages/PublicInformationPage";
import { publicInfoPages, publicInfoRouteAliases, type PublicInfoPageId } from "@/lib/public-info-content";

const queryClient = new QueryClient();
const publicInfoPageIds = Object.keys(publicInfoPages) as PublicInfoPageId[];

function AppRoutes() {
  const location = useLocation();

  return (
    <PageErrorBoundary key={`${location.pathname}:${location.key}`}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/placement-test" element={<PlacementTest />} />
        <Route path="/level-check" element={<LevelCheck />} />
        {publicInfoPageIds.map((pageId) => (
          <Route
            key={pageId}
            path={publicInfoPages[pageId].path}
            element={<PublicInformationPage pageId={pageId} />}
          />
        ))}
        <Route path="/plan" element={<Navigate to={publicInfoRouteAliases["/plan"]} replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/unsubscribe" element={<PublicUnsubscribe />} />
        <Route path="/admin/login" element={<Login admin />} />

        <Route path="/settings" element={<Settings />} />
        <Route path="/legal/terms" element={<LegalPage policy="terms" />} />
        <Route path="/legal/privacy" element={<LegalPage policy="privacy" />} />
        <Route path="/legal/tutor-agreement" element={<LegalPage policy="tutorAgreement" />} />
        <Route path="/legal/refunds" element={<LegalPage policy="refund" />} />

        <Route path="/learner/*" element={<RoleShell role="learner" />} />
        <Route path="/tutor/*" element={<RoleShell role="tutor" />} />
        <Route path="/admin/*" element={<RoleShell role="administrator" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </PageErrorBoundary>
  );
}

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
