
DROP POLICY "Authenticated can update devices" ON public.devices;
DROP POLICY "Authenticated can delete devices" ON public.devices;
DROP POLICY "Authenticated can update history" ON public.device_history;
DROP POLICY "Authenticated can delete history" ON public.device_history;

CREATE POLICY "Authenticated can update devices" ON public.devices FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete devices" ON public.devices FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update history" ON public.device_history FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete history" ON public.device_history FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
