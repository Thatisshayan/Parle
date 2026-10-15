import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { Brand } from "@/components/parle/Brand";
import PlaceholderPage from "@/pages/PlaceholderPage";
import AdminQuestionBankRepair from "@/pages/AdminQuestionBankRepair";
import LearnerTodayPlan from "@/pages/LearnerTodayPlan";
import LearnerPlan from "@/pages/LearnerPlan";
import LearnerTutorPlaceholder from "@/pages/LearnerTutorPlaceholder";
import LearnerWeeklyCheckin from "@/pages/LearnerWeeklyCheckin";
import LearnerRoadmap from "@/pages/LearnerRoadmap";
import LearnerProgress from "@/pages/LearnerProgress";
import TutorApplication from "@/pages/TutorApplication";
import TutorAvailability from "@/pages/TutorAvailability";
import TutorDashboard from "@/pages/TutorDashboard";
import TutorProfilePricing from "@/pages/TutorProfilePricing";
import LearnerLessons from "@/pages/LearnerLessons";
import TutorReviews from "@/pages/TutorReviews";
import LearnerTutors from "@/pages/LearnerTutors";
import LearnerTutorProfile from "@/pages/LearnerTutorProfile";
import AdminApplications from "@/pages/AdminApplications";
import AdminContent from "@/pages/AdminContent";
import AdminReportedContent from "@/pages/AdminReportedContent";
import AdminReviews from "@/pages/AdminReviews";
import AdminMetrics from "@/pages/AdminMetrics";
import AdminControlPanel from "@/pages/AdminControlPanel";
import AdminUsers from "@/pages/AdminUsers";
import { User, learner_profile } from "@/entities";
import { learnerOnboardingRedirect } from "@/lib/onboarding-steps";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import { getMyIdentity, roleHomePath, type ParleRole, type ParleUser } from "@/lib/parle-profile";
import { requiresServerAdminAuthorization } from "@/lib/admin-route-access";
import { superdevClient } from "@/lib/superdev/client";

type WorkspaceRole = ParleRole | "administrator";

interface RoleShellProps {
  role: WorkspaceRole;
}

interface NavItem {
  path: string;
  label: TranslationKey;
}

const learnerNav: NavItem[] = [
  { path: "/learner", label: "role.today" },
  { path: "/learner/check-in", label: "role.weeklyCheckin" },
  { path: "/placement-test", label: "role.placementTest" },
  { path: "/learner/roadmap", label: "role.roadmap" },
  { path: "/learner/ai-tutor", label: "role.aiTutor" },
  { path: "/learner/plan", label: "role.plan" },
  { path: "/learner/tutors", label: "role.tutors" },
  { path: "/learner/lessons", label: "role.lessons" },
  { path: "/learner/progress", label: "role.progress" },
  { path: "/settings", label: "role.account" },
];

const tutorNav: NavItem[] = [
  { path: "/tutor/application", label: "role.application" },
  { path: "/tutor", label: "role.tutorDashboard" },
  { path: "/tutor/students", label: "role.students" },
  { path: "/tutor/lessons", label: "role.lessons" },
  { path: "/tutor/availability", label: "role.availability" },
  { path: "/tutor/reviews", label: "role.tutorReviews" },
  { path: "/tutor/profile-pricing", label: "role.profilePricing" },
  { path: "/tutor/earnings", label: "role.earnings" },
];

const adminNav: NavItem[] = [
  { path: "/admin", label: "role.applications" },
  { path: "/admin/users", label: "role.adminUsers" },
  { path: "/admin/bookings", label: "role.adminBookings" },
  { path: "/admin/content", label: "role.adminContent" },
  { path: "/admin/reported-content", label: "role.adminReportedContent" },
  { path: "/admin/reviews", label: "role.adminReviews" },
  { path: "/admin/question-bank-repair", label: "role.adminBankRepair" },
  { path: "/admin/settings", label: "role.adminSettings" },
  { path: "/admin/metrics", label: "role.metrics" },
];

const titleForPath: Record<string, TranslationKey> = {
  "/learner": "role.todayTitle",
  "/learner/check-in": "role.weeklyCheckinTitle",
  "/learner/roadmap": "role.learnerRoadmapTitle",
  "/learner/ai-tutor": "role.aiTutorTitle",
  "/learner/plan": "role.learnerPlanTitle",
  "/learner/tutors": "role.tutorsTitle",
  "/learner/lessons": "role.learnerLessonsTitle",
  "/learner/progress": "role.progressTitle",
  "/tutor": "role.tutorDashboardTitle",
  "/tutor/application": "role.applicationTitle",
  "/tutor/students": "role.studentsTitle",
  "/tutor/lessons": "role.lessonsTitle",
  "/tutor/availability": "role.availabilityTitle",
  "/tutor/reviews": "role.tutorReviewsTitle",
  "/tutor/profile-pricing": "role.profilePricingTitle",
  "/tutor/profile-preview": "role.tutorPreviewTitle",
  "/tutor/earnings": "role.earningsTitle",
  "/admin": "role.applicationsTitle",
  "/admin/users": "role.adminUsersTitle",
  "/admin/bookings": "role.adminBookingsTitle",
  "/admin/content": "role.adminContentTitle",
  "/admin/reported-content": "role.adminReportedContentTitle",
  "/admin/reviews": "role.adminReviewsTitle",
  "/admin/question-bank-repair": "role.adminBankRepairTitle",
  "/admin/settings": "role.adminSettingsTitle",
  "/admin/metrics": "role.metricsTitle",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapServiceResponse(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) {
      current = current.result;
      continue;
    }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data || "authorized" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

function serviceErrorCode(value: unknown): string {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    if (!isObject(current)) break;
    if (current.status === 403 || current.status === "403" || current.statusCode === 403) return "ADMIN_REQUIRED";
    if (typeof current.code === "string" && current.code) return current.code;
    if (typeof current.error === "string" && current.error) return current.error;
    if (current.message === "ADMIN_REQUIRED") return "ADMIN_REQUIRED";
    if (isObject(current.result)) {
      current = current.result;
      continue;
    }
    if (isObject(current.data)) {
      current = current.data;
      continue;
    }
    if (isObject(current.response)) {
      current = current.response;
      continue;
    }
    break;
  }
  return value instanceof Error ? value.message : "";
}

export default function RoleShell({ role }: RoleShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "missing" | "error" | "admin-error">("checking");
  const [adminCheckPath, setAdminCheckPath] = useState<string | null>(null);
  const [user, setUser] = useState<ParleUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const path = location.pathname.replace(/\/$/, "") || "/";
  const isAdmin = role === "administrator";
  const protectedAdminPath = isAdmin && requiresServerAdminAuthorization(path) ? path : null;
  const visibleStatus = protectedAdminPath && adminCheckPath !== protectedAdminPath ? "checking" : status;

  useLayoutEffect(() => {
    setAdminCheckPath(null);
    setStatus("checking");
  }, [protectedAdminPath]);
  const tutorProfileMatch = role === "learner" ? path.match(/^\/learner\/tutors\/([^/]+)$/) : null;
  const tutorProfileId = tutorProfileMatch
    ? (() => { try { return decodeURIComponent(tutorProfileMatch[1]); } catch { return tutorProfileMatch[1]; } })()
    : null;
  const navItems = useMemo(() => (role === "administrator" ? adminNav : role === "tutor" ? tutorNav : learnerNav), [role]);
  const workspaceRoleKey: TranslationKey = isAdmin ? "role.admin" : role === "tutor" ? "role.tutor" : "role.learner";
  const titleKey = titleForPath[path] ?? (role === "learner" && path.startsWith("/learner/tutors/") ? "role.tutorsTitle" : isAdmin ? "role.applicationsTitle" : role === "tutor" ? "role.tutorDashboardTitle" : "role.todayTitle");
  const placeholderBodyKey: TranslationKey | undefined = role === "tutor"
    ? path === "/tutor/students" ? "tutorPlaceholder.studentsBody"
      : path === "/tutor/lessons" ? "tutorPlaceholder.lessonsBody"
        : path === "/tutor/earnings" ? "tutorPlaceholder.earningsBody"
          : undefined
    : undefined;

  useEffect(() => {
    let active = true;
    const checkAccess = async () => {
      try {
        const authenticated = await superdevClient.isAuthenticated();
        if (!active) return;
        if (!authenticated) {
          const loginPath = isAdmin ? "/admin/login" : "/login";
          navigate(`${loginPath}?from_url=${encodeURIComponent(window.location.href)}`, { replace: true });
          return;
        }

        const currentUser = (await User.me()) as ParleUser;
        if (!active) return;
        setUser(currentUser);

        if (isAdmin) {
          if (protectedAdminPath) {
            const redirectDeniedCaller = async () => {
              const identity = await getMyIdentity();
              if (!active) return;
              navigate(identity ? roleHomePath(currentUser.role, identity) : "/login", { replace: true });
            };

            let rawAuthorization: unknown;
            try {
              rawAuthorization = await parleMarketplaceService({ action: "admin_authorize" });
            } catch (error) {
              if (serviceErrorCode(error) === "ADMIN_REQUIRED" && currentUser.role !== "administrator") {
                await redirectDeniedCaller();
                return;
              }
              throw error;
            }
            if (!active) return;

            const authorization = unwrapServiceResponse(rawAuthorization);
            const code = serviceErrorCode(authorization);
            if (code === "ADMIN_REQUIRED") {
              if (currentUser.role !== "administrator") {
                await redirectDeniedCaller();
                return;
              }
              throw new Error("ADMIN_REQUIRED");
            }
            if (
              authorization.authorized !== true
              || authorization.status === "error"
              || typeof authorization.error === "string"
              || Boolean(code)
            ) {
              throw new Error(code || "ADMIN_AUTHORIZATION_UNCONFIRMED");
            }

            if (active) {
              setAdminCheckPath(protectedAdminPath);
              setStatus("ready");
            }
            return;
          }

          if (currentUser.role !== "administrator") {
            const identity = await getMyIdentity();
            if (active) navigate(identity ? roleHomePath(currentUser.role, identity) : "/login", { replace: true });
            return;
          }
          if (active) setStatus("ready");
          return;
        }

        if (currentUser.role === "administrator") {
          if (active) navigate("/admin", { replace: true });
          return;
        }

        const identity = await getMyIdentity();
        if (!active) return;
        if (!identity) {
          setStatus("missing");
          return;
        }
        if (identity.role !== role) {
          navigate(identity.role === "tutor" ? "/tutor" : "/learner", { replace: true });
          return;
        }
        if (role === "learner") {
          const profiles = await learner_profile.filter({ owner_id: currentUser.id }, "-created_at", 1);
          const redirect = learnerOnboardingRedirect(Array.isArray(profiles) && profiles.length > 0, window.location.pathname);
          if (redirect) {
            if (active) navigate(redirect, { replace: true });
            return;
          }
        }
        setStatus("ready");
      } catch (error) {
        console.error("Parle workspace access check failed", error);
        if (active) {
          if (protectedAdminPath) {
            setAdminCheckPath(protectedAdminPath);
            setStatus("admin-error");
          } else {
            setStatus("error");
          }
        }
      }
    };
    void checkAccess();
    return () => {
      active = false;
    };
  }, [isAdmin, navigate, protectedAdminPath, role]);

  async function handleSignOut() {
    setLogoutError(false);
    try {
      await superdevClient.auth.logout(false);
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Parle sign-out failed", error);
      setLogoutError(true);
    }
  }

  const navLink = (item: NavItem, mobile = false) => (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path !== "/learner/tutors"}
      onClick={() => mobile && setMenuOpen(false)}
      className={({ isActive }) => `role-nav-item ${isActive ? "role-nav-item-active" : ""}`}
    >
      {t(item.label)}
    </NavLink>
  );

  if (visibleStatus === "checking") {
    return <main className="flex min-h-screen items-center justify-center bg-background px-4"><p className="text-sm font-semibold text-muted-foreground">{t("role.loading")}</p></main>;
  }

  if (visibleStatus === "missing" || visibleStatus === "error" || visibleStatus === "admin-error") {
    const adminAccessError = visibleStatus === "admin-error";
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <section className="w-full max-w-xl rounded-[2rem] border border-primary/10 bg-white p-7 text-center shadow-[0_24px_72px_-48px_rgba(30,58,138,0.4)] sm:p-10">
          <div className="mb-7 flex justify-center"><Brand compact /></div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em] text-primary sm:text-3xl">{t(visibleStatus === "missing" ? "role.identityMissingTitle" : adminAccessError ? "role.adminAccessErrorTitle" : "role.loadErrorTitle")}</h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">{t(visibleStatus === "missing" ? "role.identityMissingBody" : adminAccessError ? "role.adminAccessErrorBody" : "role.loadErrorBody")}</p>
          {logoutError && <p role="alert" className="auth-message-error mt-5">{t("auth.error.generic")}</p>}
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/" className="parle-button-secondary justify-center">{t("role.returnHome")}</Link>
            <button type="button" onClick={handleSignOut} className="parle-button-primary justify-center">{t("common.logOut")}</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FB] lg:flex">
      <aside className="hidden w-[272px] shrink-0 flex-col border-r border-primary/10 bg-white px-5 py-6 lg:flex">
        <Brand compact />
        <div className="mt-9 rounded-2xl bg-[#F2F4F9] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("placeholder.eyebrow")}</p>
          <p className="mt-1 font-display text-sm font-extrabold text-primary">{t(workspaceRoleKey)}</p>
        </div>
        <nav aria-label={t("role.roleNavigation")} className="mt-7 flex-1 space-y-1">
          {navItems.map((item) => navLink(item))}
        </nav>
        <div className="border-t border-primary/10 pt-5">
          <div className="flex items-center gap-3 rounded-2xl px-3 py-3">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2FA] font-display text-sm font-extrabold text-primary">
              {(user?.full_name || user?.email || "P").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{user?.full_name || user?.email}</span>
          </div>
          <button type="button" onClick={handleSignOut} className="role-logout-button">
            <LogOut aria-hidden="true" className="h-4 w-4" />
            <span>{t("common.logOut")}</span>
          </button>
          {logoutError && <p role="alert" className="mt-3 text-xs leading-5 text-destructive">{t("auth.error.generic")}</p>}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex min-h-[68px] items-center justify-between border-b border-primary/10 bg-white/95 px-4 backdrop-blur sm:px-6 lg:hidden">
          <Brand compact />
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={t(menuOpen ? "nav.closeMenu" : "nav.openMenu")}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
        </header>
        {menuOpen && (
          <nav aria-label={t("role.roleNavigation")} className="sticky top-[68px] z-20 border-b border-primary/10 bg-white px-4 py-3 shadow-md sm:px-6 lg:hidden">
            <div className="space-y-1">{navItems.map((item) => navLink(item, true))}</div>
            <div className="mt-2 border-t border-primary/10 pt-2">
              <button type="button" onClick={handleSignOut} className="role-nav-item w-full text-left">{t("common.logOut")}</button>
            </div>
            {logoutError && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{t("auth.error.generic")}</p>}
          </nav>
        )}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-11 lg:px-10 lg:py-12">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C64D43]">{t(workspaceRoleKey)}</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.05em] text-primary sm:text-4xl">{t(titleKey)}</h1>
          </div>
          {path === "/admin/question-bank-repair"
            ? <AdminQuestionBankRepair />
            : path === "/admin/content"
              ? <AdminContent />
              : path === "/admin/metrics"
                ? <AdminMetrics />
              : path === "/admin/reported-content"
                ? <AdminReportedContent />
              : path === "/admin/reviews"
                ? <AdminReviews />
              : path === "/admin/users"
              ? <AdminUsers />
              : path === "/admin/settings"
                ? <AdminControlPanel />
              : path === "/admin"
                ? <AdminApplications />
              : role === "tutor" && path === "/tutor"
                ? <TutorDashboard />
                : role === "learner" && path === "/learner/lessons"
                  ? <LearnerLessons />
                  : path === "/tutor/application"
                    ? <TutorApplication />
                    : path === "/tutor/availability"
                      ? <TutorAvailability />
                      : role === "tutor" && path === "/tutor/profile-pricing"
                        ? <TutorProfilePricing />
                        : role === "tutor" && path === "/tutor/profile-preview"
                          ? <LearnerTutorProfile tutorPreview />
                        : role === "tutor" && path === "/tutor/reviews"
                        ? <TutorReviews />
                        : role === "learner" && path === "/learner"
                          ? <LearnerTodayPlan />
                          : role === "learner" && path === "/learner/check-in"
                            ? <LearnerWeeklyCheckin />
                            : role === "learner" && path === "/learner/roadmap"
                              ? <LearnerRoadmap />
                              : role === "learner" && path === "/learner/progress"
                                ? <LearnerProgress />
                                : role === "learner" && path === "/learner/plan"
                                  ? <LearnerPlan />
                                  : role === "learner" && path === "/learner/ai-tutor"
                                    ? <LearnerTutorPlaceholder />
                                    : role === "learner" && path === "/learner/tutors"
                                    ? <LearnerTutors />
                                    : role === "learner" && tutorProfileId !== null
                                      ? <LearnerTutorProfile profileId={tutorProfileId} />
                                      : <PlaceholderPage titleKey={titleKey} showTitle={false} bodyKey={placeholderBodyKey} />}
        </main>
      </div>
    </div>
  );
}
