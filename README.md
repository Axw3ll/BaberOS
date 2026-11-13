# BarberOS

CRM y sistema de gestión para barberías, listo para venderse como servicio (SaaS): agenda con disponibilidad real, reservas en línea, ficha 360° de clientes, seguimiento, mensajes automáticos por WhatsApp, campañas, tarjeta de sellos o puntos, ventas con corte de caja y comisiones, inventario, reportes, suscripciones con prueba gratis y un panel de administración para ti.

**Stack:** Next.js 16 (App Router, Server Actions) · Prisma 7 · PostgreSQL en Supabase · Supabase Auth · Tailwind CSS 4 · Stripe · WhatsApp Cloud API

## Puesta en marcha (desarrollo)

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Copia `.env.example` a `.env` y llena al menos `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Las demás son opcionales; cada una está explicada en el archivo.
3. Instala y crea las tablas:

   ```bash
   npm install
   npm run db:deploy      # aplica prisma/migrations
   npm run dev
   ```

4. Abre `http://localhost:3000`, crea tu cuenta y registra tu barbería.

> Después de cada `git pull` con migraciones nuevas: `npm install`, `npm run db:deploy` y reinicia `npm run dev` (el servidor de desarrollo guarda en memoria el cliente de Prisma anterior).

**Datos de demostración:** `SEED_OWNER_EMAIL=tu@email.com npm run db:seed` crea "Barbería El Filo" con equipo, servicios, productos, clientes con meses de historial, citas, ventas, etiquetas, seguimientos y una campaña. Entra una vez con ese email antes de correrlo.

**Sin Supabase Auth:** con `DEV_AUTH_EMAIL="tu@email.com"` en `.env`, `npm run dev` entra directo con ese usuario. En producción se ignora.

## Qué hace

| Sección | Para qué sirve |
|---|---|
| **Hoy** | Primeros pasos (para dueños nuevos), mensajes por enviar, citas que siguen, ventas del día, cumpleaños, pendientes y productos por surtir |
| **Agenda** | Día por barbero con horarios, descansos y hora actual. Tocar un hueco vacío abre una cita a esa hora |
| **Nueva cita** | Teléfono primero: si ya es cliente, se eligen solos su servicio y barbero de siempre. "Próximos huecos" para agendar con un toque |
| **Cita** | Confirmar, en silla, no llegó, cancelar. Cobrar en efectivo, tarjeta o transferencia con un toque |
| **Ventas** | Punto de venta con propina, descuento, canje de puntos y cambio. Ticket imprimible. Después de cobrar: "¿Le agendamos la próxima?" según su frecuencia |
| **Corte de caja** | Totales del turno por forma de pago, fondo, retiros y efectivo contado con la diferencia en vivo |
| **Comisiones** | Lo que se le debe a cada quien desde su último pago, y "Marcar pagado" |
| **Clientes** | Etapas (nuevo, activo, en riesgo, perdido, sin visitas), VIP, etiquetas, búsqueda, orden, importación desde Excel/CSV y exportación |
| **Ficha del cliente** | Métricas, lo que le gusta, línea de tiempo con citas, compras y bitácora, seguimientos, etiquetas, tarjeta de sellos o puntos, WhatsApp con mensajes listos, "Cobrar lo de siempre" |
| **Lealtad** | Cada barbería elige en Ajustes: **tarjeta de sellos** (un sello por visita; al completarla, servicio gratis o descuento), **puntos** (por cada peso pagado, canjeables como descuento) o nada |
| **Seguimiento** | Pendientes por responsable y oportunidades: cumpleaños, primera visita, no llegaron, ya les toca, en riesgo |
| **Mensajes por enviar** | Confirmación de reserva, recordatorios de 24 h y 2 h, no llegó, reseña, ya toca, cumpleaños, "te falta un sello" y "completaste tu tarjeta". Se preparan solos; se envían por la API de WhatsApp o con un toque |
| **Campañas** | Mensaje a un segmento o etiqueta con variables. Mide quién agendó después |
| **Reportes** | Ventas, retención, comisiones, más vendidos, mejores clientes y canales de adquisición |
| **Productos, Servicios, Equipo, Ajustes** | Inventario con kardex, servicios por barbero, roles, horarios, invitaciones, mensajes automáticos, puntos y etiquetas |
| **/b/tu-barberia** | Reservas públicas (protegidas contra abuso) |
| **/c/…** | Enlace privado del cliente: confirmar, cambiar o cancelar su cita y agregarla a su calendario |
| **/suscripcion** | Prueba gratis, planes, pago y portal de Stripe |
| **/admin** | Tu panel: barberías, estado, uso, ingreso mensual, activar planes a mano y modo soporte |

### Roles

| | Hoy | Agenda | Ventas | Clientes | Seguimiento | Campañas | Reportes | Productos | Servicios, Equipo, Ajustes |
|---|---|---|---|---|---|---|---|---|---|
| Dueño / Encargado | ✓ | Toda | ✓ + corte y comisiones | ✓ | Todo el equipo | ✓ | ✓ | ✓ | ✓ |
| Recepción | ✓ | Toda | ✓ + corte | ✓ + importar/exportar | Todo el equipo | ✓ | — | ✓ | — |
| Barbero | Suya | Solo la suya | ✓, su comisión | ✓, sin montos | Suyo | — | — | — | — |

Solo dueño y encargado cancelan ventas, pagan comisiones y borran clientes. Solo el dueño maneja la suscripción.

### Planes

| | Prueba (14 días) | Básico $299/mes | Pro $599/mes |
|---|---|---|---|
| Agenda, clientes, lealtad, ventas, inventario, mensajes | ✓ | ✓ | ✓ |
| Campañas y reportes | ✓ | — | ✓ |
| Personas en el equipo | Sin límite | 3 | Sin límite |

Al vencer la prueba o el plan, el panel lleva a `/suscripcion` y la página pública deja de recibir reservas; los datos se conservan. Si falla un pago hay 7 días de gracia. Precios y funciones se cambian en `src/lib/billing.ts`.

## Publicar en producción

### 1. Hosting (Vercel recomendado)

Conecta el repositorio en [Vercel](https://vercel.com), copia las variables de tu `.env` (con `NEXT_PUBLIC_APP_URL` = tu dominio) y despliega. Corre `npm run db:deploy` contra la base de producción antes del primer despliegue y en cada migración nueva.

### 2. Supabase Auth

- **Authentication → URL Configuration:** *Site URL* = tu dominio; en *Redirect URLs* agrega `https://tu-dominio/auth/confirm` y `https://tu-dominio/auth/callback`.
- **Authentication → Emails → Templates:** cambia el enlace de cada plantilla para que pase por `/auth/confirm`:

  | Plantilla | Enlace |
  |---|---|
  | Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` |
  | Invite user | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` |
  | Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |

- Para invitar al equipo por correo, agrega `SUPABASE_SERVICE_ROLE_KEY`. Sin ella, el dueño comparte un enlace de registro (copiar o WhatsApp).
- Apaga la *Data API* de Supabase si no la usas: la app solo entra a la base desde el servidor con Prisma, y cada consulta filtra por la barbería activa.

### 3. Stripe (suscripciones)

1. Crea dos productos con precio mensual recurrente en MXN (Básico y Pro) y copia sus `price_…` a `STRIPE_PRICE_BASIC` y `STRIPE_PRICE_PRO`.
2. Copia la llave secreta a `STRIPE_SECRET_KEY`.
3. En *Developers → Webhooks* crea un endpoint `https://tu-dominio/api/stripe/webhook` con los eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` y `customer.subscription.deleted`. Copia su secreto a `STRIPE_WEBHOOK_SECRET`.
4. Activa el *Customer portal* en Stripe (para cambiar tarjeta, plan o cancelar).

Sin `STRIPE_SECRET_KEY` el cobro queda apagado y todo está disponible. Si alguien te paga por transferencia, actívalo desde `/admin` (+30 días).

### 4. Mensajes automáticos

La bandeja se llena sola mientras alguien usa el panel. Para que se prepare y envíe aunque nadie entre, programa una llamada cada 15 minutos a:

```
GET https://tu-dominio/api/cron/mensajes
Authorization: Bearer <CRON_SECRET>
```

En Vercel Pro puedes usar Vercel Cron; en el plan gratis, un servicio externo como [cron-job.org](https://cron-job.org) con ese encabezado.

### 5. WhatsApp Cloud API (envío automático)

1. En [Meta for Developers](https://developers.facebook.com) crea una app de tipo *Business*, agrega WhatsApp y registra el número de la plataforma.
2. Crea un token permanente (usuario de sistema) y copia `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
3. En WhatsApp Manager → Plantillas, crea estas plantillas en **español (México)**. Las variables deben ir en este orden:

| Nombre | Categoría | Texto sugerido |
|---|---|---|
| `barberos_confirmacion` | Utilidad | Hola {{1}}, recibimos tu reserva en {{2}}: {{3}}, {{4}} con {{5}}. Confírmala, cámbiala o cancélala aquí: {{6}} |
| `barberos_recordatorio` | Utilidad | Hola {{1}}, te recordamos tu cita en {{2}} {{3}} con {{4}}. Confirma, cambia o cancela aquí: {{5}} |
| `barberos_recordatorio_hoy` | Utilidad | Hola {{1}}, tu cita en {{2}} es hoy a las {{3}}. ¡Te esperamos! |
| `barberos_no_llego` | Utilidad | Hola {{1}}, te esperábamos en {{2}}. ¿Todo bien? Si quieres, aparta otro horario aquí: {{3}} |
| `barberos_resena` | Utilidad | Gracias por venir a {{2}}, {{1}}. Si te gustó tu corte, nos ayudas mucho con una reseña: {{3}} |
| `barberos_ya_toca` | Marketing | Hola {{1}}, ya toca tu corte. Aparta tu lugar en {{2}}: {{3}} |
| `barberos_cumpleanos` | Marketing | ¡Feliz cumpleaños, {{1}}! De parte de todo {{2}}. Ven esta semana y te consentimos: {{3}} |
| `barberos_falta_sello` | Marketing | Hola {{1}}, ¡te falta un solo sello en {{2}} para tu {{3}}! Aparta tu próxima visita: {{4}} |
| `barberos_premio` | Marketing | ¡{{1}}, completaste tu tarjeta en {{2}}! En tu próxima visita tienes {{3}}. Aparta tu lugar: {{4}} |

Cuando Meta las apruebe, los mensajes se envían solos con la tarea programada (y con "Enviar ahora" en la bandeja). Los de marketing solo van a clientes que aceptaron promociones. Las campañas siguen enviándose con un toque, porque su texto es libre.

### 6. Lo demás

- **Datos legales:** llena `LEGAL_NAME`, `LEGAL_EMAIL` y `LEGAL_ADDRESS`, y revisa con un abogado `/privacidad` y `/terminos` (son plantillas basadas en la LFPDPPP).
- **Tu acceso de administrador:** pon tu correo en `SUPERADMIN_EMAILS` y entra a `/admin`.
- **Captcha opcional:** con `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` (Cloudflare Turnstile) las reservas públicas piden verificación. Sin ellas siguen protegidas por límite de intentos y campo trampa.

## Cómo está hecho

```
prisma/
  schema.prisma                 modelos (28 tablas)
  migrations/                   init, reglas, crm, mejoras, whatsapp, sellos
  seed.ts                       datos de demostración
src/
  proxy.ts                      sesión de Supabase y rutas públicas
  lib/
    auth.ts                     sesión, barbería activa, permisos, suscripción, modo soporte
    availability.ts             horarios libres (funciones puras)
    booking.ts                  reservar con validación de disponibilidad
    sales.ts                    cobro en una transacción (inventario, sellos, puntos, folio)
    loyalty.ts                  textos y vista previa del premio de la tarjeta
    crm.ts                      etapas, VIP, segmentos, cumpleaños, plantillas
    messages.ts                 cola de mensajes automáticos y envío
    whatsapp.ts                 WhatsApp Cloud API
    billing.ts                  planes, acceso y Stripe
    cash.ts                     corte de caja y comisiones
    guard.ts                    límite de intentos y Turnstile
  app/
    (auth)/  onboarding/  (panel)/  b/[slug]/  c/[token]/  suscripcion/  admin/
    api/cron/mensajes  api/stripe/webhook
```

**Doble reserva imposible.** Una restricción `EXCLUDE USING gist` en Postgres impide que dos citas activas del mismo barbero se encimen, aunque se reserven al mismo tiempo.

**Ventas.** Cada cobro corre en una transacción: copia precio y comisión al ticket, desglosa el IVA incluido, descuenta inventario solo si alcanza, canjea y otorga puntos, asigna folio consecutivo y marca la cita como terminada. Si algo falla, no se guarda nada.

**Etapas del cliente.** Una visita es una cita terminada o una venta sin cita. *En riesgo* si ya pasó 1.5 veces su frecuencia, *perdido* después de los días configurados (90 por defecto), *nuevo* si su primera visita fue hace menos de 30 días. *VIP* es el 10% que más gasta, con al menos 3 visitas.

**Lealtad.** *Sellos:* al cobrar un servicio (con el gasto mínimo configurado) se da un sello por visita; al llegar al número configurado se convierte en un premio que se aplica en caja, y esa visita no suma sello. *Puntos:* se ganan sobre lo pagado sin propina y se canjean como descuento. En ambos casos todo ocurre dentro de la transacción del cobro y cancelar la venta lo revierte. Los saldos nunca bajan de cero.

**Mensajes.** `syncOutbox` revisa citas y clientes y deja en la bandeja lo que toca, sin duplicar (`dedupeKey`). Los recordatorios de citas canceladas o pasadas se descartan solos.

**Reservas públicas.** Límite de intentos por IP, teléfono y barbería (en Postgres, sin servicios externos), campo trampa para bots, Turnstile opcional y máximo 2 citas futuras por teléfono.

**Historial intacto.** Citas y tickets guardan nombre y precio del momento. **Zona horaria:** todo en UTC, mostrado en la zona de la barbería.

## Diseño

Claro y moderno, igual de cómodo en celular que en el mostrador: fondo `#F5F6FA`, tarjetas blancas, índigo `#4F46E5` como color de marca y verde/ámbar/rojo para estados. Albert Sans en toda la interfaz e íconos de [lucide](https://lucide.dev). Menú lateral en computadora y barra inferior tipo app en celular. Se instala en el teléfono como app ("Agregar a pantalla de inicio").

Los tokens están al inicio de `src/app/globals.css`; para cambiar el color de marca basta con `--color-brand`, `--color-brand-hover` y `--color-brand-soft`.
