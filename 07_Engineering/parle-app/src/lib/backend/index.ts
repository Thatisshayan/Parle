import { supabase } from "./client";
import { makeEntity } from "./entities";
import { makeFunctions } from "./functions";
import { uploadProfilePhoto } from "./storage";
import * as auth from "./auth";

const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;
export const functions = makeFunctions(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string, token);

/** Drop-in for Buildy's superdevClient: the small surface the app uses, on Supabase (backend Plan 2). */
export const parleClient = {
  options: { showBranding: false, affiliateId: "" },
  entity: (name: string) => makeEntity(supabase, name),
  functions,
  isAuthenticated: () => auth.isAuthenticated(supabase),
  auth: {
    me: () => auth.me(supabase),
    updateProfile: async ({ full_name }: { full_name: string }) => auth.updateMyName(supabase, full_name),
    logout: async (_redirect?: boolean) => auth.logout(supabase),
    setToken: (_token: string) => undefined,
  },
  integrations: { core: { uploadFile: ({ file }: { file: File }) => uploadProfilePhoto(supabase, file) } },
};
