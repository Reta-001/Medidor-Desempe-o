CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS subsistemas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  configuracion_queues TEXT NOT NULL,
  capacidad_servidores INTEGER NOT NULL CHECK (capacidad_servidores >= 0)
);

CREATE TABLE IF NOT EXISTS periodos_observacion (
  id_periodo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT,
  timestamp_inicio BIGINT NOT NULL,
  timestamp_fin BIGINT,
  estado TEXT NOT NULL CHECK (estado IN ('ACTIVO', 'CERRADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_periodos_unico_activo
ON periodos_observacion (estado)
WHERE estado = 'ACTIVO';

CREATE TABLE IF NOT EXISTS eventos_operacionales (
  id BIGSERIAL PRIMARY KEY,
  id_subsistema TEXT NOT NULL REFERENCES subsistemas(id),
  id_entidad TEXT NOT NULL,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('ARRIVAL', 'START_SERVICE', 'DEPARTURE')),
  timestamp_milisegundos BIGINT NOT NULL,
  id_periodo UUID REFERENCES periodos_observacion(id_periodo),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE eventos_operacionales
DROP CONSTRAINT IF EXISTS eventos_operacionales_id_entidad_fkey;

ALTER TABLE eventos_operacionales
DROP COLUMN IF EXISTS id_servidor_asignado;

DROP TABLE IF EXISTS entidades_transito;

CREATE INDEX IF NOT EXISTS idx_eventos_periodo_subsistema
ON eventos_operacionales (id_periodo, id_subsistema, timestamp_milisegundos);

CREATE INDEX IF NOT EXISTS idx_eventos_entidad_tiempo
ON eventos_operacionales (id_entidad, timestamp_milisegundos);

CREATE INDEX IF NOT EXISTS idx_eventos_tipo_tiempo
ON eventos_operacionales (tipo_evento, timestamp_milisegundos);

CREATE TABLE IF NOT EXISTS metricas_periodo (
  id BIGSERIAL PRIMARY KEY,
  id_periodo UUID NOT NULL REFERENCES periodos_observacion(id_periodo) ON DELETE CASCADE,
  id_subsistema TEXT NOT NULL REFERENCES subsistemas(id),
  tiempo_observacion_T DOUBLE PRECISION NOT NULL,
  total_A INTEGER NOT NULL,
  total_C INTEGER NOT NULL,
  tiempo_ocupado_B DOUBLE PRECISION NOT NULL,
  tasa_llegada_lambda DOUBLE PRECISION NOT NULL,
  tiempo_servicio_S DOUBLE PRECISION,
  tasa_servicio_mu DOUBLE PRECISION,
  utilizacion_U DOUBLE PRECISION,
  throughput_X DOUBLE PRECISION NOT NULL,
  Lq_promedio_cola DOUBLE PRECISION,
  Wq_tiempo_espera_cola DOUBLE PRECISION,
  L_promedio_sistema DOUBLE PRECISION,
  W_tiempo_sistema DOUBLE PRECISION,
  calculado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_periodo, id_subsistema)
);

-- Delete obsolete subsystem AC references before insert/update to prevent FK constraint errors
DELETE FROM eventos_operacionales WHERE id_subsistema = 'AC';
DELETE FROM metricas_periodo WHERE id_subsistema = 'AC';
DELETE FROM subsistemas WHERE id = 'AC';

INSERT INTO subsistemas (id, nombre, configuracion_queues, capacidad_servidores)
VALUES
  ('SC', 'Entrada', 'M/M/2', 2),
  ('BC1', 'Banos 1', 'M/M/7', 7),
  ('BC2', 'Banos 2', 'M/M/7', 7),
  ('AC1', 'Guardarropa 1', 'M/M/1', 1),
  ('AC2', 'Guardarropa 2', 'M/M/1', 1),
  ('AC3', 'Guardarropa 3', 'M/M/1', 1),
  ('DC', 'Pista de baile', 'M/M/inf', 0),
  ('CC1', 'Barra 1', 'M/M/1', 1),
  ('CC2', 'Barra 2', 'M/M/1', 1),
  ('CC3', 'Barra 3', 'M/M/1', 1),
  ('GLOBAL', 'Resumen operacional', 'Agregado local', 0)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  configuracion_queues = EXCLUDED.configuracion_queues,
  capacidad_servidores = EXCLUDED.capacidad_servidores;
