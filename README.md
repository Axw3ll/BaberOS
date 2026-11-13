# BarberOS

Sistema para barberías con CRM: agenda con disponibilidad real, equipo, servicios, productos con inventario, ventas con ticket y comisiones, ficha 360° de clientes con segmentos, seguimiento, campañas por WhatsApp, programa de puntos, reportes y una página pública de reservas.

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
| **Clientes** | Lista con etapa (nuevo, activo, en riesgo, perdido, sin visitas), VIP, etiquetas, orden por gasto o última visita, y exportación a CSV |
| **Ficha del cliente** | Visitas, gasto, ticket promedio, cada cuánto viene y cuándo debería volver. Servicio y barbero favoritos, productos que compra. Línea de tiempo con citas, compras y bitácora (llamadas, WhatsApp, quejas). Seguimientos, etiquetas, puntos, cumpleaños, cómo nos conoció, quién lo recomendó y si acepta promociones |
| **Seguimiento** | Pendientes atrasados, de hoy y próximos. Oportunidades automáticas: cumpleaños, primera visita, no llegaron, ya les toca volver y en riesgo de perderse, con WhatsApp listo en un clic |
| **Campañas** | Mensaje a un segmento o etiqueta con variables (`{nombre}`, `{barberia}`, `{enlace}`, `{puntos}`). Se envía uno por uno con wa.me y mide quién agendó después |
| **Reportes** | Ingresos, ticket promedio y comparación con el periodo anterior. Clientes nuevos y recurrentes, retención, no-shows, reservas en línea. Comisiones por barbero, servicios y productos más vendidos, mejores clientes y canales de adquisición |
| **Ajustes** | Datos de la barbería, horario, días cerrados, reglas de reserva, IVA, programa de puntos, días para "cliente perdido" y etiquetas |
| **/b/tu-barberia** | Página pública: servicio → barbero (o "quien esté libre") → día y hora → datos |

### Roles

| | Hoy | Agenda | Ventas | Clientes | Seguimiento | Campañas | Reportes | Productos | Servicios, Equipo, Ajustes |
|---|---|---|---|---|---|---|---|---|---|
| Dueño / Encargado | ✓ | Toda | ✓ | ✓ | Todo el equipo | ✓ | ✓ | ✓ | ✓ |
| Recepción | ✓ | Toda | ✓ | ✓ + CSV | Todo el equipo | ✓ | — | ✓ | — |
| Barbero | Suya | Solo la suya | ✓ | ✓, sin montos | Suyo y sus clientes | — | — | — | — |

Solo dueño y encargado pueden cancelar ventas y borrar clientes. Los barberos no ajustan puntos ni exportan. Nadie más que el dueño edita el perfil del dueño.

## Cómo está hecho

```
prisma/
  schema.prisma                 24 tablas
  migrations/…_init             generada por Prisma
  migrations/…_reglas           reglas que Prisma no expresa (ver abajo)
  migrations/…_crm              etiquetas, bitácora, tareas, puntos, campañas
  seed.ts
src/
  proxy.ts                      sesión de Supabase y protección de rutas
  lib/
    auth.ts                     usuario, barbería activa, permisos por rol
    availability.ts             cálculo de horarios libres (funciones puras)
    booking.ts                  reservar con validación de disponibilidad
    sales.ts                    cobro en una transacción (incluye puntos)
    crm.ts                      etapas, VIP, segmentos, cumpleaños, plantillas de WhatsApp
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

**Etapas del cliente.** Una visita es una cita terminada o una venta sin cita. Con dos visitas o más se calcula cada cuánto viene. Es *en riesgo* si ya pasó 1.5 veces esa frecuencia (mínimo 14 días más), *perdido* después de los días configurados en Ajustes (90 por defecto) y *nuevo* si su primera visita fue hace menos de 30 días. *VIP* es el 10% que más gasta, con al menos 3 visitas.

**Puntos.** Se ganan sobre lo pagado sin propina y se canjean como descuento en caja, en la misma transacción del cobro. Cancelar la venta regresa lo canjeado y quita lo ganado. El saldo nunca baja de cero (restricción en la base).

**Historial intacto.** Citas y tickets guardan nombre y precio del servicio al momento. Subir el precio del corte no cambia ventas ni comisiones pasadas.

**Zona horaria.** Las citas se guardan en UTC y se muestran en la zona de la barbería (`America/Mexico_City` por defecto). Los horarios semanales se guardan en minutos locales (9:30 = 570).

## Diseño

Claro y moderno, pensado para usarse igual en el celular que en el mostrador:

- **Colores:** fondo gris muy claro `#F5F6FA`, tarjetas blancas con sombra suave y un solo color de marca, índigo `#4F46E5`. Verde, ámbar y rojo quedan reservados para estados (cita terminada, por confirmar, no llegó; cliente activo, en riesgo, perdido).
- **Tipografía:** Albert Sans en toda la interfaz; títulos y cifras con más peso y tracking cerrado.
- **Estructura:** cada sección con título es una tarjeta (`section:has(> .section-title)` en `globals.css`), las cifras clave van en tarjetas con ícono (`<Figure icon={…}>`) y los estados son pastillas teñidas (`<Dot>`).
- **Navegación:** menú lateral con íconos y grupos en computadora; barra inferior tipo app con "Más" en el celular. El número junto a *Seguimiento* son los pendientes de hoy.
- **Íconos:** [lucide-react](https://lucide.dev).

Los tokens están al inicio de `src/app/globals.css`. Para cambiar el color de marca basta con `--color-brand`, `--color-brand-hover` y `--color-brand-soft`.

## Pendiente para producción

- Limitar intentos en la página pública de reservas (por ejemplo, con Upstash Rate Limit o Cloudflare Turnstile).
- Envío automático por WhatsApp Business API (hoy las campañas y los recordatorios abren wa.me uno por uno).
- Corte de caja por turno.
- Si vas a leer tablas desde el navegador con `supabase-js`, activa RLS. Esta app solo entra a la base desde el servidor con Prisma, y cada consulta filtra por la barbería activa.
