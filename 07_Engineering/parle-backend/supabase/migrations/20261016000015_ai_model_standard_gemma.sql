-- Decision #49 revised the same day (2026-10-15): GLM 5.3 could not open an AI tutor session within 120 s on NVIDIA's
-- free service; Gemma 4 opened in 16 s and replied in 30 s. Gemma is now used for everything.
update public.app_setting set value = '"google/gemma-4-31b-it"', updated_at = now() where key = 'ai_model_standard';
