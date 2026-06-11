# Hitos de Implementacion y Debug

## Hito 1 - Base del proyecto
- [x] Leer especificacion pegada.
- [x] Confirmar workspace sin proyecto previo.
- [x] Confirmar PostgreSQL activo en `localhost:5432`.
- [x] Crear estructura modular `server`, `client`, `database`, `docs`.

## Hito 2 - Back-end PostgreSQL
- [x] Definir migracion SQL relacional.
- [x] Implementar pool PostgreSQL y migraciones.
- [x] Implementar ingesta event-driven con cola asincrona.
- [x] Implementar periodos de observacion.
- [x] Implementar calculo operacional por subsistema y global.

## Hito 3 - Exportacion PROMODEL
- [x] Exportar inter-arribos de Entrada (SC).
- [x] Exportar tiempos netos de servicio por entidad/subsistema.
- [x] Exportar matriz empirica de ruteo y razones de visita.

## Hito 4 - MCP
- [x] Implementar servidor MCP propio conectado a PostgreSQL.
- [x] Exponer tools y resources declarativos.
- [x] Actualizar configuracion MCP local sin romper el server PostgreSQL existente.

## Hito 5 - Front-end operacional
- [x] Implementar SPA React responsiva.
- [x] Implementar captura ergonomica por click y hotkeys.
- [x] Implementar seleccion visual de servidores multicanal.
- [x] Implementar dashboard de metricas en tiempo real.
- [x] Implementar panel de exportacion CSV.

## Hito 6 - Debug integral
- [x] Instalar dependencias.
- [x] Ejecutar migracion contra PostgreSQL.
- [x] Ejecutar tests unitarios.
- [x] Compilar back-end y front-end.
- [x] Levantar servidores locales.
- [x] Verificar UI en navegador con captura.
- [x] Auditar flujo real por API con timestamps reales.
- [x] Auditar flujo real por UI con clicks.
- [x] Auditar hotkeys `A`, `S`, `D`.
- [x] Revisar consola del navegador sin errores.
- [x] Confirmar ausencia de overflow horizontal en desktop y mobile.
