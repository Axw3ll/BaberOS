# BarberOS

Sistema para barberías: agenda con disponibilidad real, equipo, servicios, productos con inventario, ventas con ticket y comisiones, clientes y una página pública de reservas.

**Stack:** Next.js 16 (App Router, Server Actions) · Prisma 7 · PostgreSQL en Supabase · Supabase Auth · Tailwind CSS 4

## Puesta en marcha

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Copia `.env.example` a `.env` y llena las variables:
   - `DATABASE_URL`: Database → Connection string → **Transaction pooler** (puerto 6543), con `?pgbouncer=true` al final.
   - `DIRECT_URL`: la de **Session pooler** o la conexión directa (puerto 5432).
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Project Settings → API.
3. Instala y crea las tablas:

   ```bash
   npm install
   npm run db:deploy      # aplica prisma/migrations (tablas + reglas)
   npm run dev
   ```

4. Abre `http://localhost:3000`, crea tu cuenta y registra tu barbería.

En Supabase → Authentication → URL Configuration, agrega `http://localhost:3000/auth/callback` (y la de producción) a las Redirect URLs para que funcione el correo de confirmación.

### Datos de demostración (opcional)

```bash
SEED_OWNER_EMAIL=axelomar.a.v@gmail.com npm run db:seed
```

Crea "Barbería El Filo" con 4 personas, 5 servicios, 8 productos, 12 clientes, citas de hoy y mañana, y algunas ventas. Entra una vez con ese email antes de correrlo.

### Desarrollo sin Supabase Auth

Con `DEV_AUTH_EMAIL="tu@email.com"` en `.env`, la app entra directo con ese usuario y no pide login. Solo funciona con `npm run dev`; en producción se ignora.

## Qué hace

| Sección | Para qué sirve |
|---|---|
| **Hoy** | Citas que siguen, lo vendido en el día, productos por surtir |
| **Agenda** | Vista del día por barbero, con horarios, descansos y la hora actual |
| **Nueva cita** | Solo muestra horarios libres de verdad. Si el cliente ya vino, completa su nombre con el teléfono |
| **Cita** | Confirmar, pasar a la silla, no llegó, cancelar, cobrar |
| **Ventas** | Cobro de servicios y productos, propina, descuento, efectivo con cambio. Ticket imprimible y cancelación que regresa el producto al inventario |
| **Productos** | Ceras, geles, pomadas, etc. Precio, costo, margen, mínimo para avisar, entradas, uso interno, conteo físico y kardex |
| **Servicios** | Duración, precio y quién lo hace |
| **Equipo** | Roles, comisiones, horario semanal (con turno partido), servicios y ausencias. Invitación por email |
| **Clientes** | Historial de visitas, lo que ha gastado, veces que no llegó, notas |
| **Ajustes** | Datos de la barbería, horario, días cerrados, reglas de reserva, IVA |
| **/b/tu-barberia** | Página pública: servicio → barbero (o "quien esté libre") → día y hora → datos |

### Roles

| | Hoy | Agenda | Ventas | Clientes | Productos | Servicios, Equipo, Ajustes |
|---|---|---|---|---|---|---|
| Dueño / Encargado | ✓ | Toda | ✓ | ✓ | ✓ | ✓ |
| Recepción | ✓ | Toda | ✓ | ✓ | ✓ | — |
| Barbero | Suya | Solo la suya | ✓ | ✓ | — | — |

Solo dueño y encargado pueden cancelar ventas. Nadie más que el dueño edita el perfil del dueño.

## Cómo está hecho

```
prisma/
  schema.prisma                 17 tablas
  migrations/…_init             generada por Prisma
  migrations/…_reglas           reglas que Prisma no expresa (ver abajo)
  seed.ts
src/
  proxy.ts                      sesión de Supabase y protección de rutas
  lib/
    auth.ts                     usuario, barbería activa, permisos por rol
    availability.ts             cálculo de horarios libres (funciones puras)
    booking.ts                  reservar con validación de disponibilidad
    sales.ts                    cobro en una transacción
    time.ts                     zonas horarias sin librerías
  app/
    (auth)/                     login y registro
    onboarding/                 alta de barbería
    (panel)/                    todas las secciones del panel
    b/[slug]/                   reservas públicas
  components/                   UI compartida
```

**Disponibilidad.** Un horario está libre si cae dentro del horario de la barbería **y** del turno del barbero, y no choca con cierres, ausencias ni otras citas activas. Para reservas en línea también respeta la anticipación mínima y el máximo de días.

**Doble reserva imposible.** La migración `reglas` agrega una restricción `EXCLUDE USING gist` en Postgres: dos citas activas del mismo barbero no pueden encimarse aunque se reserven al mismo milisegundo. Las canceladas y los no-show no bloquean.

**Ventas.** Cada cobro corre en una transacción: copia precio y comisión al ticket, desglosa el IVA incluido, descuenta inventario solo si alcanza (`stock >= cantidad`), asigna folio consecutivo por barbería y marca la cita como terminada. Si algo falla, no se guarda nada.

**Historial intacto.** Citas y tickets guardan nombre y precio del servicio al momento. Subir el precio del corte no cambia ventas ni comisiones pasadas.

**Zona horaria.** Las citas se guardan en UTC y se muestran en la zona de la barbería (`America/Mexico_City` por defecto). Los horarios semanales se guardan en minutos locales (9:30 = 570).

## Diseño

Oscuro y sobrio, inspirado en la barbería clásica:

- **Colores:** pizarra `#1C1B19` de fondo, espuma `#EEEAE3` para el texto, ceniza `#9C978D` para lo secundario, y un solo acento frío, níquel `#C9CFD1`, como el acero de una navaja. Los estados de las citas usan tonos apagados (arena, salvia, rosa viejo).
- **Tipografía:** Marcellus para títulos y cifras (letras romanas grabadas, como en los letreros y las navajas), Albert Sans para la interfaz.
- **El detalle:** la regla de horas de la agenda se dibuja como los dientes de un peine: diente largo cada hora, corto cada 15 minutos. Aparece también en el login.
- Sin sombras ni degradados: líneas finas, mucho espacio, y bordes redondeados según la jerarquía.

Los tokens están al inicio de `src/app/globals.css`.

## Pendiente para producción

- Limitar intentos en la página pública de reservas (por ejemplo, con Upstash Rate Limit o Cloudflare Turnstile).
- Recordatorios por WhatsApp o SMS.
- Corte de caja por turno y reporte de comisiones por periodo.
- Si vas a leer tablas desde el navegador con `supabase-js`, activa RLS. Esta app solo entra a la base desde el servidor con Prisma, y cada consulta filtra por la barbería activa.
