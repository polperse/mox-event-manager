# Mox Tournament Control

Sistema operativo para gestionar torneos TCG de hasta 14 jugadores en Mox TCG, con una consola de administración y un visor público LCARS independiente.

## Correcciones de la versión 1.0.1

- Eliminación de jugadores mediante confirmación explícita de dos pasos.
- Edición de nombres separada de la eliminación para evitar operaciones simultáneas.
- Respuestas de error legibles y consistentes, incluso si la sesión se interrumpe.
- Validación de capacidad, rondas, mesas, pairings duplicados y resultados.
- Comprobación de que cada operación realmente modificó el registro solicitado.
- Pruebas integrales de todas las operaciones administrativas y de persistencia.

## Funcionalidades

- Múltiples torneos con historial y selección del evento activo.
- Hasta 14 jugadores activos y 8 mesas soportadas por el sistema.
- Alta, edición, baja y activación/desactivación de jugadores.
- Importación manual de pairings generados por EventLink, Bandai TCG+ u otra plataforma oficial.
- Historial de rondas y recuperación de rondas anteriores.
- Resultados por mesa.
- Standings progresivos por ronda y finales por evento, incluso para torneos archivados.
- Temporizador persistente y autoritativo: iniciar, pausar, ajustar, finalizar y reiniciar.
- Indicador segmentado de tiempo restante.
- Avisos publicados en el visor.
- Ambientación visual LCARS y sonidos configurables por evento.
- Visor y consola sincronizados automáticamente mediante la base de datos.
- Registro de operaciones administrativas.
- Base de datos local D1/SQLite para desarrollo y Cloudflare D1 al publicar.

## Requisitos locales

- Node.js 22.13 o superior.
- npm 10 o superior.
- macOS, Linux o Windows con WSL.

Comprobá la versión instalada:

```bash
node --version
npm --version
```

## Instalación y ejecución local

1. Descomprimí el proyecto.
2. Abrí una Terminal dentro de la carpeta del proyecto.
3. Instalá las dependencias:

```bash
npm install
```

4. Iniciá la aplicación:

```bash
npm run dev
```

5. Abrí las siguientes direcciones:

- Visor público: `http://localhost:5175/`
- Consola de control: `http://localhost:5175/control`

La primera vez que abras la aplicación se crearán automáticamente las tablas y un torneo de demostración con 14 jugadores.

## Uso en el local

La forma más sencilla es conectar el monitor público como segunda pantalla del ordenador:

1. Abrí `/control` en una ventana para administrar el evento.
2. Abrí `/` en otra ventana y movela al monitor público.
3. Activá pantalla completa desde el botón inferior del visor.
4. Ambas ventanas se sincronizan automáticamente.

Los efectos se activan desde **Eventos** en la consola. Si los sonidos están habilitados para el evento, pulsá **Activar audio** una vez en el visor; los navegadores requieren esa interacción antes de permitir avisos sonoros.

También podés abrir el visor desde otro dispositivo de la misma red. Iniciá el servidor con:

```bash
npm run dev -- --host 0.0.0.0
```

Después abrí `http://IP-DE-TU-ORDENADOR:5175/` desde el segundo dispositivo. El firewall del sistema puede pedir permiso para aceptar conexiones locales.

## Cargar pairings

En la consola:

1. Entrá en **Pairings**.
2. Indicá el número de ronda.
3. Pegá una mesa por línea, separando los jugadores con `|`.

```text
Marc Vidal | Laia Pujol
Nil Costa | Pol Ferrer
Júlia Roca | BYE
```

4. Revisá la vista previa.
5. Pulsá **Publicar ronda**.

La publicación reinicia y pausa el temporizador de la ronda. Después podés iniciarlo desde el panel.

## Consultar standings

En `/control`, abrí **Standings** para ver la clasificación acumulada en directo o hasta una ronda concreta. Elegí otro evento en el selector para consultar su historial sin activarlo ni alterar el visor. Los resultados pendientes se indican como **provisionales**; al completar todas las rondas configuradas, la tabla aparece como **final**. Los participantes con partidas previas siguen figurando aunque se desactiven o eliminen después.

En el evento activo, pulsá **Mostrar standings** para sustituir los pairings en la pantalla pública. **Mostrar pairings** recupera la vista habitual. El visor siempre presenta los standings más recientes del evento activo; seleccionar una ronda histórica en la consola no modifica el visor.

## Puntuación suiza y sugerencias de pairings

- Un match ganado (1 · 0, 2 · 0 o 2 · 1) vale **3 puntos**; uno empatado (1 · 1), **1 punto**; uno perdido (0 · 1, 0 · 2 o 1 · 2), **0 puntos**. Un BYE cuenta como victoria 2 · 0.
- Los pairings sugeridos agrupan primero por puntos de match y evitan repetir rivales cuando es posible; un 1 · 0 tiene el mismo peso que un 2 · 0 a ese nivel.
- Para ordenar jugadores empatados se usan, en este orden, porcentaje de victorias de los oponentes, porcentaje de juegos ganados y porcentaje de juegos ganados de los oponentes. Los porcentajes de desempate tienen un mínimo de 33 %; los BYE no cuentan como oponentes.
- Referencia: [Magic Tournament Rules, apéndice C (puntos y desempates)](https://blogs.magicjudges.org/rules/mtr-appendix-c/).

## Persistencia y copias de seguridad

En modo local, los datos se guardan dentro de `.wrangler/`. Para hacer una copia de seguridad con la aplicación detenida, copiá esa carpeta completa.

Para comenzar desde cero, cerrá el servidor y eliminá `.wrangler/`. Al volver a ejecutar la aplicación se creará una base nueva con los datos de demostración.

## Estructura principal

```text
app/
  api/admin/route.ts       Operaciones administrativas protegidas
  api/state/route.ts       Estado público sincronizado
  api/standings/route.ts   Clasificación histórica por evento y ronda
  components/lcars.tsx     Componentes y conexión del cliente
  control/                 Consola de administración
  page.tsx                 Visor público
db/
  initialize.ts            Creación y datos iniciales
  schema.ts                Modelo relacional Drizzle
  tournament.ts            Consultas y operaciones del torneo
drizzle/
  0000_*.sql               Migración de la base de datos
```

## Seguridad

- En local, las operaciones administrativas se permiten únicamente desde `localhost`, `127.0.0.1` o el entorno interno de prueba.
- En la versión publicada, `/control` requiere iniciar sesión con ChatGPT y las escrituras vuelven a comprobar la identidad en el servidor.
- El visor `/` es de solo lectura.

## Comandos útiles

```bash
npm run dev          # Ejecutar localmente
npm run typecheck    # Comprobar TypeScript
npm run lint         # Analizar el código
npm run db:generate  # Regenerar migraciones tras cambiar el esquema
```

## Tecnologías

- React 19
- Vinext / Next App Router
- Cloudflare Workers
- Cloudflare D1 (SQLite compatible)
- Drizzle ORM
- TypeScript
