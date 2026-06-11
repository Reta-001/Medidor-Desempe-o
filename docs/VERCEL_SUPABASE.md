# Despliegue en Vercel con Supabase Realtime

## 1. Preparar Supabase

1. Crea un proyecto en Supabase.
2. Abre SQL Editor.
3. Ejecuta completo el archivo `database/supabase_realtime.sql`.
4. Verifica que Realtime este activo para:
   - `periodos_observacion`
   - `eventos_operacionales`
   - `metricas_periodo`

El SQL crea tablas, politicas publicas para esta app de captura y funciones RPC atomicas para evitar choques cuando dos dispositivos registran eventos al mismo tiempo.

## 2. Variables de entorno

En Vercel agrega:

```text
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key_publica
```

Para desarrollo local, crea `client/.env` con esas mismas variables.

## 3. Vercel

El archivo `vercel.json` ya define:

- Build command: `npm run build`
- Output directory: `client/dist`
- Framework: `vite`

Puedes importar el repositorio en Vercel y desplegar desde la raiz del proyecto.

## 4. Prueba realtime

1. Abre la URL desplegada en dos telefonos o dos pestanas.
2. Presiona `Iniciar T` en una.
3. Confirma que la otra cambia a `Periodo activo`.
4. Registra `+ LLEGADA` o `SALIDA` en cualquier subsistema.
5. Confirma que ambas pantallas muestran la misma entidad, cola, servicio y reloj.
