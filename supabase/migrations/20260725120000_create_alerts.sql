-- Migration for Alerts table and Public QR scanning policies

CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.alerts(created_at DESC);

GRANT SELECT, INSERT ON public.alerts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;

-- Anon can only SELECT devices and UPDATE the status column
GRANT SELECT ON public.devices TO anon;
GRANT UPDATE (status) ON public.devices TO anon;

-- Anon can SELECT and INSERT history, and UPDATE return_date/status only
GRANT SELECT, INSERT ON public.device_history TO anon;
GRANT UPDATE (return_date, status, notes) ON public.device_history TO anon;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  -- Alerts: anyone can read and insert
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read alerts') THEN
    CREATE POLICY "Anyone can read alerts" ON public.alerts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can insert alerts') THEN
    CREATE POLICY "Anyone can insert alerts" ON public.alerts FOR INSERT WITH CHECK (true);
  END IF;

  -- Devices: anyone can read, anon can update status only
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read devices') THEN
    CREATE POLICY "Anyone can read devices" ON public.devices FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can update device status') THEN
    CREATE POLICY "Anyone can update device status" ON public.devices FOR UPDATE USING (true) WITH CHECK (true);
  END IF;

  -- History: anyone can read and insert, anon can update return fields
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read history') THEN
    CREATE POLICY "Anyone can read history" ON public.device_history FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can insert history') THEN
    CREATE POLICY "Anyone can insert history" ON public.device_history FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can update history') THEN
    CREATE POLICY "Anyone can update history" ON public.device_history FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;
