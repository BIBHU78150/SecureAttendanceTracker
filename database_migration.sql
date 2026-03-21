-- Supabase Database Migration for Geofenced Event Attendance Tracker

-- Create Enums (Idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'volunteer');
    END IF;
END $$;

-- Table: teams
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL
);

-- Predefined team insertions
INSERT INTO public.teams (name) VALUES 
('Decoration'),
('Food'),
('Invitation'),
('Cultural'),
('Design & Media'),
('Stage Management'),
('Gifts & Certificates')
ON CONFLICT (name) DO NOTHING;

-- Table: whitelisted_users
CREATE TABLE IF NOT EXISTS public.whitelisted_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    roll_number TEXT NOT NULL,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
    initial_password TEXT, -- Admin assigned password for first-time Roll No login
    mobile_number TEXT, -- New field for student contact
    full_name TEXT -- New field for student display name
);

-- Ensure columns exist for existing tables
ALTER TABLE public.whitelisted_users ADD COLUMN IF NOT EXISTS initial_password TEXT;
ALTER TABLE public.whitelisted_users ADD COLUMN IF NOT EXISTS mobile_number TEXT;
ALTER TABLE public.whitelisted_users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Table: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    roll_number TEXT,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    role public.user_role DEFAULT 'volunteer',
    device_token TEXT,
    mobile_number TEXT, -- New field synced from whitelist or added by admin
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Table: locations
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    target_lat FLOAT NOT NULL,
    target_lng FLOAT NOT NULL,
    radius_meters INTEGER DEFAULT 50 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL
);

-- Table: attendance_logs
CREATE TABLE IF NOT EXISTS public.attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    punch_in_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    punch_out_time TIMESTAMPTZ,
    status TEXT DEFAULT 'Present' NOT NULL,
    is_manual_entry BOOLEAN DEFAULT false NOT NULL
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whitelisted_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if a user is an admin without triggering RLS recursion
-- Runs as SECURITY DEFINER to bypass RLS checks on the profiles table
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Creating standard RLS Policies
-- Teams: Anyone can read
DROP POLICY IF EXISTS "Teams are viewable by all users." ON public.teams;
CREATE POLICY "Teams are viewable by all users." ON public.teams FOR SELECT USING (true);

-- Whitelisted Users: Admins can read/write, volunteers can't
DROP POLICY IF EXISTS "Admins can manage whitelisted users" ON public.whitelisted_users;
CREATE POLICY "Admins can manage whitelisted users" ON public.whitelisted_users FOR ALL USING (public.is_admin());

-- Profiles: Users can select/update their own; Admins can do all
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (
    id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "Users can update their own device_token" ON public.profiles;
CREATE POLICY "Users can update their own device_token" ON public.profiles FOR UPDATE USING (
    id = auth.uid() OR public.is_admin()
);

-- Locations: Viewable by all, managed by admin
DROP POLICY IF EXISTS "Locations viewable by everyone" ON public.locations;
CREATE POLICY "Locations viewable by everyone" ON public.locations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage locations" ON public.locations;
CREATE POLICY "Admins can manage locations" ON public.locations FOR ALL USING (public.is_admin());

-- Attendance Logs: Users insert/update their own logs, Admins can do all
DROP POLICY IF EXISTS "Users can view own logs" ON public.attendance_logs;
CREATE POLICY "Users can view own logs" ON public.attendance_logs FOR SELECT USING (
    user_id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "Users can insert own logs" ON public.attendance_logs;
CREATE POLICY "Users can insert own logs" ON public.attendance_logs FOR INSERT WITH CHECK (
    user_id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "Users can update own logs" ON public.attendance_logs;
CREATE POLICY "Users can update own logs" ON public.attendance_logs FOR UPDATE USING (
    user_id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "Admins can manage logs" ON public.attendance_logs;
CREATE POLICY "Admins can manage logs" ON public.attendance_logs FOR ALL USING (public.is_admin());

-- Creating the Auth Trigger for automatically populating Profile details
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    whitelist_record public.whitelisted_users%ROWTYPE;
BEGIN
    -- Check if user is in whitelist
    SELECT * INTO whitelist_record FROM public.whitelisted_users WHERE email = NEW.email;
    
    -- STRICT ENFORCEMENT: If not in whitelist, reject account creation
    IF whitelist_record.id IS NULL THEN
        RAISE EXCEPTION 'This email is not whitelisted for this event.';
    END IF;
    
    INSERT INTO public.profiles (id, email, full_name, roll_number, team_id, role, mobile_number)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', whitelist_record.full_name, 'Student ' || whitelist_record.roll_number),
        whitelist_record.roll_number,
        whitelist_record.team_id,
        'volunteer',
        whitelist_record.mobile_number
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS attendance_logs_user_id_idx ON public.attendance_logs (user_id);
CREATE INDEX IF NOT EXISTS attendance_logs_date_idx ON public.attendance_logs (date);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

-- RPC Function for looking up email by roll number (for custom Roll No login logic)
-- Runs as SECURITY DEFINER to bypass RLS entirely for unauthenticated users.
DROP FUNCTION IF EXISTS public.get_email_by_roll(text);
CREATE OR REPLACE FUNCTION public.get_email_by_roll(roll_no text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  associated_email text;
BEGIN
  SELECT email INTO associated_email FROM public.whitelisted_users WHERE roll_number = roll_no LIMIT 1;
  RETURN associated_email;
END;
$$;

-- RPC Function for checking initial password if Auth user doesn't exist yet
DROP FUNCTION IF EXISTS public.check_whitelist_password(text, text);
CREATE OR REPLACE FUNCTION public.check_whitelist_password(roll_no text, pass text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.whitelisted_users 
    WHERE roll_number = roll_no AND initial_password = pass
  );
END;
$$;
