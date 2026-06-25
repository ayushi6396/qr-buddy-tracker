
CREATE TABLE public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  purchase_date DATE,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.device_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  issued_to_name TEXT NOT NULL,
  issued_to_email TEXT,
  issue_date DATE NOT NULL,
  expected_return_date DATE,
  return_date DATE,
  status TEXT NOT NULL DEFAULT 'issued',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_history_device_id ON public.device_history(device_id);
CREATE INDEX idx_devices_device_code ON public.devices(device_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_history TO authenticated;
GRANT ALL ON public.device_history TO service_role;

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read devices" ON public.devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update devices" ON public.devices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete devices" ON public.devices FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can read history" ON public.device_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert history" ON public.device_history FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update history" ON public.device_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete history" ON public.device_history FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_device_history_updated_at BEFORE UPDATE ON public.device_history FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
