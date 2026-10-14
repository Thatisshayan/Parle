import { createSuperdevClient } from "@superdevhq/client";

export const superdevClient = createSuperdevClient({
  appId: import.meta.env.VITE_APP_ID,
  requiresAuth: false,
  showBranding: false,
  affiliateId: '',
  baseUrl: import.meta.env.VITE_SUPERDEV_BASE_URL,
  loginUrl: '/login',
});
