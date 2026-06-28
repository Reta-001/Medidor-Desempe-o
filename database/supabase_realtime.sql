CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.subsistemas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  configuracion_queues TEXT NOT NULL,
  capacidad_servidores INTEGER NOT NULL CHECK (capacidad_servidores >= 0)
);

CREATE TABLE IF NOT EXISTS public.periodos_observacion (
  id_periodo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT,
  timestamp_inicio BIGINT NOT NULL,
  timestamp_fin BIGINT,
  estado TEXT NOT NULL CHECK (estado IN ('ACTIVO', 'CERRADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_periodos_unico_activo
ON public.periodos_observacion (estado)
WHERE estado = 'ACTIVO';

CREATE TABLE IF NOT EXISTS public.eventos_operacionales (
  id BIGSERIAL PRIMARY KEY,
  id_subsistema TEXT NOT NULL REFERENCES public.subsistemas(id),
  id_entidad TEXT NOT NULL,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('ARRIVAL', 'START_SERVICE', 'DEPARTURE')),
  timestamp_milisegundos BIGINT NOT NULL,
  id_periodo UUID REFERENCES public.periodos_observacion(id_periodo),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eventos_periodo_subsistema
ON public.eventos_operacionales (id_periodo, id_subsistema, timestamp_milisegundos);

CREATE INDEX IF NOT EXISTS idx_eventos_entidad_tiempo
ON public.eventos_operacionales (id_entidad, timestamp_milisegundos);

CREATE INDEX IF NOT EXISTS idx_eventos_tipo_tiempo
ON public.eventos_operacionales (tipo_evento, timestamp_milisegundos);

CREATE TABLE IF NOT EXISTS public.metricas_periodo (
  id BIGSERIAL PRIMARY KEY,
  id_periodo UUID NOT NULL REFERENCES public.periodos_observacion(id_periodo) ON DELETE CASCADE,
  id_subsistema TEXT NOT NULL REFERENCES public.subsistemas(id),
  tiempo_observacion_t DOUBLE PRECISION NOT NULL,
  total_a INTEGER NOT NULL,
  total_c INTEGER NOT NULL,
  tiempo_ocupado_b DOUBLE PRECISION NOT NULL,
  tasa_llegada_lambda DOUBLE PRECISION NOT NULL,
  tiempo_servicio_s DOUBLE PRECISION,
  tasa_servicio_mu DOUBLE PRECISION,
  utilizacion_u DOUBLE PRECISION,
  throughput_x DOUBLE PRECISION NOT NULL,
  lq_promedio_cola DOUBLE PRECISION,
  wq_tiempo_espera_cola DOUBLE PRECISION,
  l_promedio_sistema DOUBLE PRECISION,
  w_tiempo_sistema DOUBLE PRECISION,
  calculado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_periodo, id_subsistema)
);

INSERT INTO public.subsistemas (id, nombre, configuracion_queues, capacidad_servidores)
VALUES
  ('SC', 'Entrada', 'M/M/1', 1),
  ('BC1', 'Banos 1', 'M/M/7', 7),
  ('BC2', 'Banos 2', 'M/M/7', 7),
  ('AC', 'Guardarropa', 'M/M/3', 3),
  ('DC', 'Pista de baile', 'M/M/inf', 0),
  ('CC1', 'Barra 1', 'M/M/1', 1),
  ('CC2', 'Barra 2', 'M/M/1', 1),
  ('CC3', 'Barra 3', 'M/M/1', 1),
  ('GLOBAL', 'Resumen operacional', 'Agregado local', 0)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  configuracion_queues = EXCLUDED.configuracion_queues,
  capacidad_servidores = EXCLUDED.capacidad_servidores;

ALTER TABLE public.periodos_observacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_operacionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metricas_periodo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subsistemas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subsistemas_public_read ON public.subsistemas;
CREATE POLICY subsistemas_public_read
ON public.subsistemas FOR SELECT
USING (true);

DROP POLICY IF EXISTS periodos_public_read ON public.periodos_observacion;
CREATE POLICY periodos_public_read
ON public.periodos_observacion FOR SELECT
USING (true);

DROP POLICY IF EXISTS periodos_public_write ON public.periodos_observacion;
CREATE POLICY periodos_public_write
ON public.periodos_observacion FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS periodos_public_update ON public.periodos_observacion;
CREATE POLICY periodos_public_update
ON public.periodos_observacion FOR UPDATE
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS periodos_public_delete ON public.periodos_observacion;
CREATE POLICY periodos_public_delete
ON public.periodos_observacion FOR DELETE
USING (estado <> 'ACTIVO');

DROP POLICY IF EXISTS eventos_public_read ON public.eventos_operacionales;
CREATE POLICY eventos_public_read
ON public.eventos_operacionales FOR SELECT
USING (true);

DROP POLICY IF EXISTS eventos_public_write ON public.eventos_operacionales;
CREATE POLICY eventos_public_write
ON public.eventos_operacionales FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS eventos_public_delete ON public.eventos_operacionales;
CREATE POLICY eventos_public_delete
ON public.eventos_operacionales FOR DELETE
USING (true);

DROP POLICY IF EXISTS metricas_public_read ON public.metricas_periodo;
CREATE POLICY metricas_public_read
ON public.metricas_periodo FOR SELECT
USING (true);

DROP POLICY IF EXISTS metricas_public_write ON public.metricas_periodo;
CREATE POLICY metricas_public_write
ON public.metricas_periodo FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS metricas_public_update ON public.metricas_periodo;
CREATE POLICY metricas_public_update
ON public.metricas_periodo FOR UPDATE
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS metricas_public_delete ON public.metricas_periodo;
CREATE POLICY metricas_public_delete
ON public.metricas_periodo FOR DELETE
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.periodos_observacion TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.eventos_operacionales TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metricas_periodo TO anon, authenticated;
GRANT SELECT ON public.subsistemas TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_epoch_ms()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT floor(extract(epoch from clock_timestamp()) * 1000)::BIGINT;
$$;

CREATE OR REPLACE FUNCTION public.start_observation_period(p_name TEXT DEFAULT NULL)
RETURNS public.periodos_observacion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_period public.periodos_observacion%ROWTYPE;
BEGIN
  SELECT *
  INTO active_period
  FROM public.periodos_observacion
  WHERE estado = 'ACTIVO'
  ORDER BY timestamp_inicio DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN active_period;
  END IF;

  BEGIN
    INSERT INTO public.periodos_observacion (nombre, timestamp_inicio, estado)
    VALUES (p_name, public.current_epoch_ms(), 'ACTIVO')
    RETURNING * INTO active_period;
  EXCEPTION WHEN unique_violation THEN
    SELECT *
    INTO active_period
    FROM public.periodos_observacion
    WHERE estado = 'ACTIVO'
    ORDER BY timestamp_inicio DESC
    LIMIT 1;
  END;

  RETURN active_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_observation_period(p_timestamp BIGINT DEFAULT NULL)
RETURNS public.periodos_observacion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stopped_period public.periodos_observacion%ROWTYPE;
  stopped_at BIGINT := COALESCE(p_timestamp, public.current_epoch_ms());
BEGIN
  SELECT *
  INTO stopped_period
  FROM public.periodos_observacion
  WHERE estado = 'ACTIVO'
  ORDER BY timestamp_inicio DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay periodo ACTIVO para detener';
  END IF;

  UPDATE public.periodos_observacion
  SET estado = 'CERRADO',
      timestamp_fin = stopped_at
  WHERE id_periodo = stopped_period.id_periodo
  RETURNING * INTO stopped_period;

  RETURN stopped_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_arrival(
  p_subsystem_id TEXT,
  p_timestamp BIGINT DEFAULT NULL
)
RETURNS SETOF public.eventos_operacionales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_id UUID;
  server_capacity INTEGER;
  queue_model TEXT;
  is_infinite BOOLEAN;
  occupied INTEGER;
  next_number INTEGER;
  next_entity_id TEXT;
  event_time BIGINT := COALESCE(p_timestamp, public.current_epoch_ms());
  inserted_event public.eventos_operacionales%ROWTYPE;
BEGIN
  SELECT id_periodo
  INTO active_id
  FROM public.periodos_observacion
  WHERE estado = 'ACTIVO'
  ORDER BY timestamp_inicio DESC
  LIMIT 1
  FOR UPDATE;

  IF active_id IS NULL THEN
    RAISE EXCEPTION 'No hay periodo activo - presiona Iniciar T primero';
  END IF;

  SELECT capacidad_servidores, configuracion_queues
  INTO server_capacity, queue_model
  FROM public.subsistemas
  WHERE id = p_subsystem_id AND id <> 'GLOBAL';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subsistema desconocido: %', p_subsystem_id;
  END IF;

  is_infinite := server_capacity = 0 OR position('inf' in lower(queue_model)) > 0;

  WITH entity_state AS (
    SELECT
      id_entidad,
      min(timestamp_milisegundos) FILTER (WHERE tipo_evento = 'START_SERVICE') AS start_ms,
      min(timestamp_milisegundos) FILTER (WHERE tipo_evento = 'DEPARTURE') AS departure_ms
    FROM public.eventos_operacionales
    WHERE id_periodo = active_id
      AND id_subsistema = p_subsystem_id
    GROUP BY id_entidad
  )
  SELECT count(*)::INTEGER
  INTO occupied
  FROM entity_state
  WHERE departure_ms IS NULL
    AND start_ms IS NOT NULL;

  SELECT count(*)::INTEGER + 1
  INTO next_number
  FROM public.eventos_operacionales
  WHERE id_periodo = active_id
    AND id_subsistema = p_subsystem_id
    AND tipo_evento = 'ARRIVAL';

  next_entity_id := p_subsystem_id || '-' || next_number;

  INSERT INTO public.eventos_operacionales (
    id_subsistema,
    id_entidad,
    tipo_evento,
    timestamp_milisegundos,
    id_periodo
  )
  VALUES (p_subsystem_id, next_entity_id, 'ARRIVAL', event_time, active_id)
  RETURNING * INTO inserted_event;
  RETURN NEXT inserted_event;

  IF is_infinite OR occupied < server_capacity THEN
    INSERT INTO public.eventos_operacionales (
      id_subsistema,
      id_entidad,
      tipo_evento,
      timestamp_milisegundos,
      id_periodo
    )
    VALUES (p_subsystem_id, next_entity_id, 'START_SERVICE', event_time, active_id)
    RETURNING * INTO inserted_event;
    RETURN NEXT inserted_event;
  END IF;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_departure(
  p_subsystem_id TEXT,
  p_timestamp BIGINT DEFAULT NULL
)
RETURNS SETOF public.eventos_operacionales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_id UUID;
  event_time BIGINT := COALESCE(p_timestamp, public.current_epoch_ms());
  departing_entity TEXT;
  promoted_entity TEXT;
  inserted_event public.eventos_operacionales%ROWTYPE;
BEGIN
  SELECT id_periodo
  INTO active_id
  FROM public.periodos_observacion
  WHERE estado = 'ACTIVO'
  ORDER BY timestamp_inicio DESC
  LIMIT 1
  FOR UPDATE;

  IF active_id IS NULL THEN
    RAISE EXCEPTION 'No hay periodo activo';
  END IF;

  WITH entity_state AS (
    SELECT
      id_entidad,
      min(timestamp_milisegundos) FILTER (WHERE tipo_evento = 'ARRIVAL') AS arrival_ms,
      min(timestamp_milisegundos) FILTER (WHERE tipo_evento = 'START_SERVICE') AS start_ms,
      min(timestamp_milisegundos) FILTER (WHERE tipo_evento = 'DEPARTURE') AS departure_ms
    FROM public.eventos_operacionales
    WHERE id_periodo = active_id
      AND id_subsistema = p_subsystem_id
    GROUP BY id_entidad
  )
  SELECT id_entidad
  INTO departing_entity
  FROM entity_state
  WHERE departure_ms IS NULL
    AND start_ms IS NOT NULL
  ORDER BY start_ms ASC, arrival_ms ASC, id_entidad ASC
  LIMIT 1;

  IF departing_entity IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.eventos_operacionales (
    id_subsistema,
    id_entidad,
    tipo_evento,
    timestamp_milisegundos,
    id_periodo
  )
  VALUES (p_subsystem_id, departing_entity, 'DEPARTURE', event_time, active_id)
  RETURNING * INTO inserted_event;
  RETURN NEXT inserted_event;

  WITH entity_state AS (
    SELECT
      id_entidad,
      min(timestamp_milisegundos) FILTER (WHERE tipo_evento = 'ARRIVAL') AS arrival_ms,
      min(timestamp_milisegundos) FILTER (WHERE tipo_evento = 'START_SERVICE') AS start_ms,
      min(timestamp_milisegundos) FILTER (WHERE tipo_evento = 'DEPARTURE') AS departure_ms
    FROM public.eventos_operacionales
    WHERE id_periodo = active_id
      AND id_subsistema = p_subsystem_id
    GROUP BY id_entidad
  )
  SELECT id_entidad
  INTO promoted_entity
  FROM entity_state
  WHERE departure_ms IS NULL
    AND start_ms IS NULL
  ORDER BY arrival_ms ASC, id_entidad ASC
  LIMIT 1;

  IF promoted_entity IS NOT NULL THEN
    INSERT INTO public.eventos_operacionales (
      id_subsistema,
      id_entidad,
      tipo_evento,
      timestamp_milisegundos,
      id_periodo
    )
    VALUES (p_subsystem_id, promoted_entity, 'START_SERVICE', event_time, active_id)
    RETURNING * INTO inserted_event;
    RETURN NEXT inserted_event;
  END IF;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_subsystem_events(p_subsystem_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_id UUID;
  deleted_count INTEGER;
BEGIN
  SELECT id_periodo
  INTO active_id
  FROM public.periodos_observacion
  WHERE estado = 'ACTIVO'
  ORDER BY timestamp_inicio DESC
  LIMIT 1
  FOR UPDATE;

  IF active_id IS NULL THEN
    RAISE EXCEPTION 'No hay periodo activo';
  END IF;

  DELETE FROM public.eventos_operacionales
  WHERE id_periodo = active_id
    AND id_subsistema = p_subsystem_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_observation_period(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stop_observation_period(BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_arrival(TEXT, BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_departure(TEXT, BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_subsystem_events(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_epoch_ms() TO anon, authenticated;

ALTER TABLE public.periodos_observacion REPLICA IDENTITY FULL;
ALTER TABLE public.eventos_operacionales REPLICA IDENTITY FULL;
ALTER TABLE public.metricas_periodo REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.periodos_observacion;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.eventos_operacionales;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.metricas_periodo;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
