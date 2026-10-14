const SERVER_CHECKED_ADMIN_PATHS = new Set<string>([
  "/admin/settings",
  "/admin/users",
  "/admin/content",
  "/admin/metrics",
  "/admin/reported-content",
  "/admin/reviews",
  "/admin/question-bank-repair",
]);

export function requiresServerAdminAuthorization(path: string): boolean {
  return SERVER_CHECKED_ADMIN_PATHS.has(path);
}
