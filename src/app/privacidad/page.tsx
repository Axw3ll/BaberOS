import { LEGAL, LegalPage } from "@/components/legal";

export const metadata = { title: "Aviso de privacidad" };

// Plantilla basada en la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (México).
// Revísala con un abogado antes de usarla comercialmente.
export default function PrivacidadPage() {
  return (
    <LegalPage title="Aviso de privacidad">
      <p>
        {LEGAL.name}, con domicilio en {LEGAL.address} (“BarberOS”), es responsable del tratamiento de los datos personales de las
        personas que usan la plataforma para administrar su barbería. Respecto de los datos de los clientes de cada barbería,
        la barbería es la responsable y BarberOS actúa como encargado: los trata solo por cuenta y bajo instrucciones de la barbería.
      </p>

      <h2>Datos que recabamos</h2>
      <ul>
        <li><strong>Dueños y equipo de la barbería:</strong> nombre, correo electrónico, teléfono, rol y datos de uso de la plataforma.</li>
        <li><strong>Clientes de la barbería:</strong> nombre, teléfono, correo (opcional), fecha de cumpleaños (opcional), historial de citas y compras, notas sobre sus preferencias y si acepta recibir promociones.</li>
        <li><strong>Pagos de la suscripción:</strong> los procesa Stripe; BarberOS no guarda números de tarjeta.</li>
      </ul>
      <p>No recabamos datos personales sensibles.</p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Agendar, confirmar, recordar y administrar citas.</li>
        <li>Registrar ventas, comisiones, inventario y puntos de lealtad.</li>
        <li>Enviar recordatorios y avisos relacionados con las citas.</li>
        <li>Prestar, facturar y dar soporte al servicio de BarberOS.</li>
      </ul>
      <p>
        <strong>Finalidad secundaria:</strong> enviar promociones, felicitaciones de cumpleaños y mensajes para invitar a regresar, solo a
        quienes lo aceptan. Cualquier cliente puede pedir a su barbería, o a nosotros, dejar de recibirlos en cualquier momento.
      </p>

      <h2>Con quién los compartimos</h2>
      <p>
        Con proveedores que nos ayudan a operar el servicio, bajo obligaciones de confidencialidad: alojamiento y base de datos
        (Supabase, Vercel), pagos (Stripe) y mensajería (WhatsApp de Meta, cuando se active). No vendemos datos personales.
      </p>

      <h2>Derechos ARCO y revocación</h2>
      <p>
        Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos, y revocar tu consentimiento, escribiendo a{" "}
        <a href={`mailto:${LEGAL.email}`} className="link">{LEGAL.email}</a> con tu nombre, el dato de contacto registrado y lo que pides.
        Si eres cliente de una barbería, también puedes pedírselo directamente a ella. Responderemos en un máximo de 20 días hábiles.
      </p>

      <h2>Conservación y seguridad</h2>
      <p>
        Conservamos los datos mientras la barbería tenga una cuenta activa y, después, el tiempo que exijan las leyes fiscales y
        mercantiles. Usamos conexiones cifradas y control de acceso por rol.
      </p>

      <h2>Cambios</h2>
      <p>Publicaremos cualquier cambio a este aviso en esta misma página.</p>
    </LegalPage>
  );
}
