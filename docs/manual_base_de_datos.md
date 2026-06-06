# Manual de Base de Datos — Sistema de Recolección de Desechos

> **Para quién es este documento:** Cualquier miembro del equipo que necesite hacer consultas o escribir datos en Supabase, sin importar si nunca ha trabajado con Supabase antes.

---

## ¿Qué es Supabase?

Supabase es la base de datos del proyecto. Funciona como PostgreSQL (una base de datos relacional clásica) pero con dos cosas extra que usamos activamente:

- **Auth** — maneja el login de administradores y choferes con email/contraseña.
- **Realtime** — notifica a las apps en tiempo real cuando un dato cambia, sin necesidad de hacer polling.

Para conectarte desde el código solo necesitas dos variables de entorno que ya están en el proyecto:

```
SUPABASE_URL        → dirección del proyecto
SUPABASE_ANON_KEY   → clave pública (la única que va en el cliente)
```

> ⚠️ **Nunca uses la `service_role_key` en la app.** Esa clave bypasea toda la seguridad.

---

## Regla de oro: Row Level Security (RLS)

Todas las tablas tienen **RLS activado**. Esto significa que Supabase filtra automáticamente qué filas puede ver o modificar cada usuario según su identidad. No es algo que tú programas — es una capa de seguridad en la base de datos.

| Quién hace la consulta | Qué puede ver |
|---|---|
| **Chofer autenticado** | Solo sus propios recorridos, posiciones e hitos |
| **Ciudadano (sin sesión)** | Solo recorridos activos y sus posiciones en tiempo real |
| **Administrador** | Todo — pero solo desde el dashboard web |

Esto significa que si un chofer hace una consulta a `recorridos`, automáticamente solo le aparecen los suyos. No tienes que agregar filtros extras en el código para esto.

---

## Mapa general de tablas

El esquema tiene dos grupos de tablas:

**Tablas del dashboard web** (ya existían):
```
administrador → Chofer → asignaciones ← vehiculos
                                      ← Rutas
```

**Tablas de la app móvil** (nuevas — Sprint 1):
```
recorridos → posiciones_gps
           → posiciones_live
           → hitos_control
```

---

## Tablas del dashboard web

### `administrador`
El usuario con acceso al panel de gestión. No interactúa con la app móvil.

| Campo clave | Qué es |
|---|---|
| `id` | Número entero autoincremental |
| `user_id` | UUID de Supabase Auth — vincula con el login |
| `puede_crear_choferes`, `puede_asignar`, etc. | Permisos granulares |

---

### `Chofer`
Cada conductor registrado en el sistema.

| Campo clave | Qué es |
|---|---|
| `id` | **Número entero (bigint)** — es el ID que usan las demás tablas para referenciarlo |
| `user_id` | UUID de Supabase Auth — vincula con el login de la app |
| `activo` | Si es `false`, el chofer no puede iniciar sesión |

> 💡 Cuando un chofer inicia sesión, su `auth.uid()` es el UUID de Auth. Para obtener su `id` (bigint) hay que hacer una consulta a esta tabla usando `user_id = auth.uid()`.

---

### `vehiculos`
Cada camión de recolección.

| Campo clave | Qué es |
|---|---|
| `id` | UUID — ID interno de Supabase |
| `vehiculo_id_api` | ID en la API externa — **no confundir con `id`** |
| `disponible` | Si es `false`, no puede asignarse a un chofer |

---

### `Rutas`
Las rutas de recolección definidas en el mapa.

| Campo clave | Qué es |
|---|---|
| `id` | Número entero (bigint) — ID interno |
| `id_ruta` | **UUID — este es el que se envía a la API externa** |
| `shape` | GeoJSON almacenado como JSON — contiene las coordenadas del trayecto para Mapbox |
| `trayecto` | Mismo trayecto pero en formato PostGIS — para cálculos de distancia |

> ⚠️ **Punto crítico:** Cuando necesites el ID de una ruta para llamar a la API externa, usa siempre `id_ruta` (UUID). Nunca uses `id` (el número entero) para llamadas externas.

---

### `asignaciones`
Vincula un chofer con un vehículo y una ruta para un horario específico.

| Campo clave | Qué es |
|---|---|
| `id` | UUID |
| `chofer_id` | FK → `Chofer.id` (bigint) |
| `vehiculo_id` | FK → `vehiculos.id` (UUID) |
| `ruta_id` | FK → `Rutas.id` (bigint) |
| `estado` | `activa` / `inactiva` / `suspendida` |
| `dias_semana` | Array de números: `[1,3,5]` = Lunes, Miércoles, Viernes |
| `hora_inicio` / `hora_fin` | Hora del servicio en ese día |
| `fecha_inicio` | Desde cuándo está vigente la asignación — se conserva siempre |

**Para cargar la asignación activa de un chofer**, la app debe:
1. Obtener el `id` del chofer desde la tabla `Chofer` usando su `user_id`
2. Buscar en `asignaciones` donde `chofer_id` coincida y `estado = 'activa'`
3. Traer junto con los datos del vehículo y la ruta en una sola consulta (join)

---

## Tablas de la app móvil

### `recorridos`
El registro de cada viaje que hace un chofer. Es la tabla central de la app.

| Campo clave | Qué es |
|---|---|
| `id` | UUID — ID interno del recorrido en Supabase |
| `chofer_id` | FK → `Chofer.id` |
| `vehiculo_id` | FK → `vehiculos.id` |
| `ruta_id` | FK → `Rutas.id` |
| `asignacion_id` | FK → `asignaciones.id` |
| `estado` | `en_curso` / `completado` / `suspendido` |
| `fecha_inicio` | Cuándo empezó — se llena automáticamente |
| `fecha_fin` | Cuándo terminó — vacío mientras está activo |
| `distancia_total_km` | Se actualiza en tiempo real o al cerrar |
| `recorrido_id_api` | **ID que devuelve la API externa al iniciar el recorrido** — necesario para todas las llamadas posteriores a la API |

**Regla de negocio importante:** Un chofer solo puede tener **un recorrido `en_curso` a la vez**. La base de datos rechaza automáticamente crear un segundo si ya existe uno activo.

**Ciclo de vida del estado:**

```
(inicio) → en_curso → completado  (el chofer finalizó manualmente)
                    → suspendido   (superó 24 horas sin finalizar)
```

---

### `posiciones_gps`
El historial completo de coordenadas GPS durante un recorrido. Acumula todas las lecturas.

| Campo clave | Qué es |
|---|---|
| `id` | UUID |
| `recorrido_id` | FK → `recorridos.id` |
| `ubicacion` | Punto geográfico PostGIS — **es el campo principal** |
| `latitud` / `longitud` | Se calculan automáticamente desde `ubicacion` — se pueden leer como cualquier número |
| `timestamp_captura` | Momento real de la lectura en el dispositivo |
| `posicion_id_api` | ID que devuelve la API externa al registrar esa posición — se usa para adjuntar imágenes |
| `sincronizado_api_externa` | `false` mientras no se haya enviado a la API externa |

> 💡 No necesitas preocuparte por `ubicacion` al leer datos — usa directamente `latitud` y `longitud`. Solo necesitas el formato especial (`SRID=4326;POINT(lon lat)`) al **escribir** una posición nueva.

---

### `posiciones_live`
**Una sola fila por recorrido activo.** No es un historial — es la posición actual del camión. Se sobreescribe cada vez que el chofer envía una nueva coordenada.

Esta es la tabla que usa la **App Ciudadano** para mostrar los camiones en el mapa en tiempo real.

| Campo clave | Qué es |
|---|---|
| `recorrido_id` | PK y FK → `recorridos.id` — garantiza una sola fila por recorrido |
| `ubicacion` | Posición actual del camión |
| `latitud` / `longitud` | Calculadas automáticamente |
| `updated_at` | Última vez que se actualizó — indica cuán reciente es la posición |

**Diferencia clave con `posiciones_gps`:**

| | `posiciones_gps` | `posiciones_live` |
|---|---|---|
| Filas por recorrido | Cientos o miles | Exactamente 1 |
| Operación | `INSERT` (acumula) | `UPSERT` (sobreescribe) |
| Propósito | Historial y auditoría | Mapa en tiempo real |
| Quién la lee | App Chofer (sync) | App Ciudadano |

---

### `hitos_control`
Cada evento que ocurre al acumular 1 km de recorrido. Puede incluir una foto de evidencia.

| Campo clave | Qué es |
|---|---|
| `id` | UUID |
| `recorrido_id` | FK → `recorridos.id` |
| `numero_hito` | Contador secuencial: 1, 2, 3... (uno por km) |
| `km_acumulado` | Kilómetros exactos al momento del hito |
| `ubicacion` | Posición GPS al momento del hito |
| `tiene_foto` | `true` si el chofer tomó foto, `false` si la omitió |
| `foto_base64` | Imagen en Base64 — solo mientras no se haya sincronizado |
| `imagen_url` | URL de la imagen ya procesada en el servidor externo |
| `imagen_sincronizada` | `true` una vez que la API externa confirmó la recepción |
| `sincronizado_api_externa` | `true` cuando el hito completo fue enviado a la API |

**Ciclo de vida de una foto:**
```
1. Chofer toma foto → foto_base64 se llena, imagen_sincronizada = false
2. App sube la imagen a la API externa → devuelve una URL
3. imagen_url se llena, imagen_sincronizada = true
4. foto_base64 se borra para liberar espacio
```

---

## IDs: la parte más importante

Esta es la fuente de errores más común. El proyecto maneja dos sistemas de IDs en paralelo.

| Tabla | ID interno (Supabase) | ID externo (API) |
|---|---|---|
| `Rutas` | `id` (bigint) — para joins internos | `id_ruta` (UUID) — para la API externa |
| `vehiculos` | `id` (UUID) — para joins internos | `vehiculo_id_api` (text) — para la API externa |
| `recorridos` | `id` (UUID) — para joins internos | `recorrido_id_api` (text) — para la API externa |
| `posiciones_gps` | `id` (UUID) | `posicion_id_api` (text) — para subir imágenes |

**Regla simple:** Para todo lo que sea dentro de Supabase (joins, foreign keys, queries), usa el campo `id`. Para todo lo que sea una llamada a `apirecoleccion.gonzaloandreslucio.com`, usa el campo `_api`.

---

## Cómo interactúa Supabase con la API externa

La API externa vive en `https://apirecoleccion.gonzaloandreslucio.com/api` y tiene su propia base de datos. Supabase y la API externa son sistemas independientes que la app mantiene sincronizados.

El campo `perfil_id` que pide la API siempre es el mismo valor fijo:
```
50dad3d9-66ea-42a1-a06f-c502606d638f
```

### Flujo de sincronización

Cada operación en la app sigue este patrón: **primero Supabase, luego API externa.**

```
┌─────────────────────────────────────────────────────────┐
│  1. Guardar en Supabase  →  2. Enviar a API externa     │
│                              3. Guardar el ID devuelto  │
└─────────────────────────────────────────────────────────┘
```

### Tabla de correspondencia por operación

| Acción | En Supabase | En API externa |
|---|---|---|
| Iniciar recorrido | `INSERT` en `recorridos` | `POST /recorridos/iniciar` → guardar respuesta en `recorridos.recorrido_id_api` |
| Registrar posición GPS | `INSERT` en `posiciones_gps` | `POST /recorridos/{recorrido_id_api}/posiciones` → guardar respuesta en `posiciones_gps.posicion_id_api` |
| Subir foto de hito | `UPDATE` en `hitos_control` con `foto_base64` | `POST /recorridos/posiciones/{posicion_id_api}/imagen` → guardar URL en `hitos_control.imagen_url` |
| Finalizar recorrido | `UPDATE` en `recorridos` con `estado` y `fecha_fin` | `POST /recorridos/{recorrido_id_api}/finalizar` |

### Modo sin conexión

Cuando no hay internet, la app guarda todo localmente (SQLite). Al recuperar conexión, el `SyncService` procesa la cola en este orden:

```
1. Posiciones GPS pendientes (sincronizado_api_externa = false)
2. Imágenes de hitos pendientes (imagen_sincronizada = false)
3. Hitos completos pendientes (sincronizado_api_externa = false)
```

Los campos `sincronizado_api_externa` e `imagen_sincronizada` son el mecanismo que usa el sistema para saber qué falta enviar.

---

## Cómo saber qué tabla tocar según tu tarea

| Si estás implementando... | Tablas involucradas |
|---|---|
| Login del chofer | Solo `Chofer` (para obtener el `id` desde `user_id`) |
| Pantalla de configuración | `asignaciones` + `vehiculos` + `Rutas` |
| Iniciar un recorrido | `recorridos` |
| Enviar posición GPS | `posiciones_gps` + `posiciones_live` (ambas) |
| Registrar un hito | `hitos_control` |
| Subir foto de evidencia | `hitos_control` (actualizar `imagen_url`) |
| Mapa en tiempo real (ciudadano) | `posiciones_live` (Realtime) |
| Ruta más cercana al ciudadano | Función `ruta_mas_cercana()` en Supabase |
| Finalizar recorrido | `recorridos` |

---

## Realtime — solo para la App Ciudadano

La tabla `posiciones_live` está configurada para emitir eventos en tiempo real. La App Ciudadano se suscribe a esta tabla y recibe una notificación cada vez que un camión actualiza su posición.

Hay tres tipos de evento que puede recibir:

| Evento | Cuándo ocurre | Qué hacer en la app |
|---|---|---|
| `INSERT` | Un camión inició recorrido | Agregar marcador al mapa |
| `UPDATE` | Un camión se movió | Mover el marcador existente |
| `DELETE` | Un recorrido terminó | Quitar el marcador del mapa |

> 💡 El evento de Realtime solo trae los campos de `posiciones_live` (coordenadas, velocidad, timestamp). Los datos del vehículo y la ruta (placa, nombre de ruta) se cargan una sola vez al inicio y se conservan en el estado de la app.

---

## Convenciones que debe seguir todo el equipo

| Convención | Detalle |
|---|---|
| **Timestamps** | Siempre en UTC. Usar `new Date().toISOString()` en JavaScript |
| **Formato de punto GPS** | Al escribir: `SRID=4326;POINT(longitud latitud)` — primero longitud, luego latitud |
| **Al leer coordenadas** | Usar directamente `latitud` y `longitud` como números normales |
| **perfil_id** | Constante fija — nunca generarla, nunca hardcodearla en cada archivo, importarla desde `api/apiExterna.js` |
| **foto_base64** | Limpiar este campo después de confirmar `imagen_sincronizada = true` |
| **Verificar `error`** | Toda consulta a Supabase devuelve `{ data, error }` — siempre verificar `error` antes de usar `data` |

---

## Glosario rápido

| Término | Qué significa en este proyecto |
|---|---|
| **RLS** | Seguridad a nivel de fila — Supabase filtra automáticamente qué datos puede ver cada usuario |
| **FK** | Foreign Key — un campo que apunta al ID de otra tabla |
| **UUID** | Identificador único universal — se ve como `3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| **bigint** | Número entero grande — lo usan `Chofer.id` y `Rutas.id` |
| **UPSERT** | Insertar si no existe, actualizar si ya existe — lo usa `posiciones_live` |
| **PostGIS** | Extensión de PostgreSQL para datos geográficos — permite calcular distancias entre coordenadas |
| **Realtime** | Sistema de Supabase que notifica cambios en tablas via WebSocket |
| **WKT** | Formato de texto para puntos geográficos: `SRID=4326;POINT(-76.52 3.42)` |
