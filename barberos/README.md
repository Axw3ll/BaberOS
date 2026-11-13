# BarberOS

Sistema SaaS para barberías: agenda anti-choques, reserva en línea, anticipos, cobros, caja, gastos, productos, lealtad, recordatorios por WhatsApp (manuales) y login con PIN por roles. Es multi-tenant: cada barbería está aislada por `barbershopId`.

**Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL · Prisma 7 (adaptador `pg`) · Zod · Stripe SDK. Los montos se guardan en **centavos de MXN**.

## Levantarlo

**1. Consigue una base PostgreSQL** (elige una opción):

- **Supabase (recomendado):** crea un proyecto, pulsa *Connect* y copia la cadena del **Session pooler** (termina en `:5432/postgres`). La base ya existe, así que no hay que crear nada más. Después apaga la *Data API* del proyecto: BarberOS no la usa y así nadie puede leer tus tablas con la llave pública.
- **PostgreSQL local:** instálalo y crea una base vacía con `createdb barberos` (o con `psql -U postgres -c "CREATE DATABASE barberos;"` en Windows).

```bash
# 2. Variables de entorno (en Windows: copy .env.example .env)
cp .env.example .env        # pega tu DATABASE_URL y pon un APP_SECRET de 32+ caracteres

# 3. Dependencias, cliente de Prisma y migraciones
npm install
npx prisma generate
npx prisma migrate deploy   # aplica prisma/migrations (incluye la restricción anti-choques)

# 4. Datos demo (opcional; barbería marcada como demo)
npm run db:seed

# 5. Arrancar
npm run build && npm start  # o npm run dev
```

Abre <http://localhost:3000>. Para crear una barbería real ve a **/setup**. La demo vive en **/demo**: PIN del dueño 1234, recepción 2222 y barbero Luis 3333.

> Si tu red bloquea `binaries.prisma.sh` y `prisma migrate` no puede descargar su motor, usa `node prisma/wasm-migrate.mjs apply`, que aplica las mismas migraciones con el motor en WebAssembly. Para `prisma generate` en ese caso basta con `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate`.

### Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL |
| `APP_SECRET` | Sí | Cifra (AES-256-GCM) las llaves de Stripe que guarda cada barbería |
| `APP_URL` | Sí | URL pública, para las páginas de éxito y cancelación de Stripe |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | No | Stripe de la **plataforma** para cobrar la suscripción mensual |

Las llaves de Stripe de **cada barbería** (para los anticipos) se capturan en *Ajustes → Pagos en línea* y no van en `.env`.

## Pruebas

Con el servidor corriendo: `npm test`, que ejecuta `tests/e2e-api.ts` (92 comprobaciones contra la API real).

## Estructura

- `prisma/schema.prisma`: modelos. `prisma/migrations`: SQL, incluida la restricción `EXCLUDE USING gist` contra traslapes.
- `lib/auth.ts`: sesiones, PIN con scrypt y bloqueo tras 5 intentos. `lib/permissions.ts`: matriz de roles que se aplica en el servidor.
- `lib/domain/*`: reglas de negocio (citas, cobros, anticipo, lealtad, caja, mensajes, Stripe).
- `app/api/**`: endpoints. `components/**`: interfaz móvil.

## Qué falta para activar lo externo

- **WhatsApp automático:** hoy el envío es manual con enlaces `wa.me`. Para automatizarlo, implementa `MessageProvider` en `lib/domain/messaging.ts` (WhatsApp Business Cloud API o Twilio, con plantillas aprobadas por Meta), devuélvelo en `getProvider()` y agrega una tarea programada que recorra los recordatorios de hoy y mañana.
- **Cobro con tarjeta:** captura `sk_…` y `whsec_…` en Ajustes y registra en Stripe el webhook `/api/stripe/webhook/<id de la barbería>` con el evento `checkout.session.completed`. Para la suscripción, configura `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` y el webhook `/api/stripe/webhook`.
