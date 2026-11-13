import Link from "next/link";
import { LEGAL, LegalPage } from "@/components/legal";

export const metadata = { title: "Términos y condiciones" };

// Plantilla. Revísala con un abogado antes de usarla comercialmente.
export default function TerminosPage() {
  return (
    <LegalPage title="Términos y condiciones">
      <p>
        Estos términos regulan el uso de BarberOS, servicio de {LEGAL.name}. Al crear una cuenta aceptas estos términos y el{" "}
        <Link href="/privacidad" className="link">aviso de privacidad</Link>.
      </p>

      <h2>El servicio</h2>
      <p>BarberOS es un software en línea para administrar agenda, clientes, ventas, inventario y comunicación de barberías.</p>

      <h2>Prueba gratis, planes y pagos</h2>
      <ul>
        <li>Cada barbería tiene 14 días de prueba gratis, sin tarjeta.</li>
        <li>Después, el servicio se cobra por adelantado cada mes según el plan elegido. Los precios incluyen IVA salvo que se indique otra cosa.</li>
        <li>Puedes cancelar cuando quieras desde la sección Suscripción; el acceso sigue hasta el final del periodo pagado. No hay reembolsos por periodos parciales.</li>
        <li>Si un pago falla, la cuenta pasa a solo lectura hasta que se regularice.</li>
      </ul>

      <h2>Tus datos y los de tus clientes</h2>
      <ul>
        <li>La información que capturas es tuya. Puedes exportar tus clientes en cualquier momento.</li>
        <li>Tú eres responsable de contar con el consentimiento de tus clientes para guardar sus datos y enviarles mensajes, y de respetar cuando pidan no recibir promociones.</li>
        <li>Si cancelas, conservaremos tus datos 90 días por si regresas; después los borraremos, salvo lo que la ley obligue a guardar.</li>
      </ul>

      <h2>Uso aceptable</h2>
      <p>No puedes usar BarberOS para enviar mensajes no solicitados, suplantar a otras personas ni intentar acceder a cuentas ajenas.</p>

      <h2>Disponibilidad y responsabilidad</h2>
      <p>
        Hacemos lo razonable para que el servicio esté disponible y respaldado, pero se ofrece “tal cual”. Nuestra responsabilidad
        total se limita a lo que pagaste en los últimos tres meses.
      </p>

      <h2>Contacto</h2>
      <p>Escríbenos a <a href={`mailto:${LEGAL.email}`} className="link">{LEGAL.email}</a>.</p>
    </LegalPage>
  );
}
