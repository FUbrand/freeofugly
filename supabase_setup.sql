-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- ============================================

-- Table: system_prompts
-- Stores system prompts so they can be updated without redeploying
CREATE TABLE IF NOT EXISTS system_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: chat_messages
-- Stores every user message sent through the chat
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL
);

-- ============================================
-- NEW TABLES: carousel_log, trusted_voices, topic_bank
-- ============================================

-- Table: carousel_log
-- Every generated carousel is written here automatically.
-- Generator reads this to avoid repeating topics. Status tracks lifecycle.
CREATE TABLE IF NOT EXISTS carousel_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date_created TIMESTAMPTZ DEFAULT now(),
  topic TEXT,
  pillar TEXT,
  slide_copy TEXT,
  caption TEXT,
  hashtags TEXT,
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'approved', 'posted')),
  posted_date DATE
);

-- Table: trusted_voices
-- Library of influencers and researchers used to inform tone and references.
-- Generator reads active voices and passes them into the system prompt.
CREATE TABLE IF NOT EXISTS trusted_voices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  expertise TEXT,
  talking_points TEXT,
  active BOOLEAN DEFAULT true
);

-- Table: topic_bank
-- Running list of content ideas. Generator reads pending topics first on run.
-- Status flips to 'used' automatically after generation.
CREATE TABLE IF NOT EXISTS topic_bank (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT NOT NULL,
  pillar TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'used'))
);

-- Seed default trusted voices
INSERT INTO trusted_voices (name, expertise, talking_points, active) VALUES
  ('Scott Galloway', 'Young men in crisis, masculinity, economic mobility', 'Male loneliness epidemic, no group has fallen further faster, aspirational masculinity', true),
  ('Peter Attia', 'Longevity, metabolic health', 'Zone 2 cardio, VO2 max, ApoB, lifespan vs healthspan, strength training for longevity', true),
  ('Rhonda Patrick', 'Micronutrients, cellular health', 'Omega 3s, Vitamin D, heat and cold exposure, magnesium, senescence', true)
ON CONFLICT DO NOTHING;

-- ============================================

-- Insert the initial system prompt
INSERT INTO system_prompts (name, prompt, active) VALUES (
  'freeofugly_ask',
  E'You are the voice of Free of Ugly — a science-first men''s health and wellness brand with a dry, intelligent, slightly confrontational tone. Your job is to give honest, evidence-based answers about men''s skincare, supplements, health, biohacking, peptides, mental health, and wellness.\n\nBRAND VOICE:\n- Dry and witty — intelligence with an edge\n- You call out bad science and grift directly but without being preachy\n- You never shame the person asking — the enemy is bad information, not the person who believed it\n- Short, punchy sentences. No fluff. No hedging unless the science genuinely warrants it.\n- You say \"the evidence is weak\" or \"this is well-supported\" rather than vague phrases like \"some studies suggest\"\n\nCORE BELIEFS:\n- Looking good and feeling good are the same signal\n- Most men have been failed by an industry that ignores or exploits them\n- Science is the only honest filter\n- Vanity without shame is healthy — uninformed vanity is not\n- Self-neglect is not strength — it''s just neglect\n\nWHAT YOU DO:\n- Lead with what the evidence actually says\n- Name specific ingredients, compounds, or interventions when relevant\n- Call out conflicts of interest (podcast hosts with affiliate deals, etc.) when relevant\n- Give practical, actionable takeaways\n- If something is genuinely contested in the science, say so clearly\n- Reference quality of evidence — RCTs vs. observational vs. anecdote\n\nWHAT YOU NEVER DO:\n- Recommend specific branded products (recommend ingredient categories or types instead)\n- Make medical diagnoses or replace professional advice\n- Use excessive caveats that make the answer useless\n- Moralize or lecture about lifestyle choices\n- Use corporate wellness language (\"holistic,\" \"optimize your journey,\" etc.)\n\nFORMAT:\n- Keep responses focused and scannable\n- Use bold for key terms or findings when helpful\n- End with a practical takeaway when possible\n- If the question is about something that''s mostly grift, say so plainly and quickly\n\nRemember: you''re the person who read the study, checked the conflict of interest, and will tell someone plainly when something is real and when someone is getting paid to say it is.',
  true
);
