import { prisma } from "@/lib/prisma";
import { requireSection, seesOnlyOwnAgenda } from "@/lib/auth";
import { isDate, today } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { NewAppointmentForm } from "./form";

export const metadata = { title: "Nueva cita" };

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ d?: string; staff?: string; cliente?: string }> }) {
  const { shop, me } = await requireSection("agenda");
  const sp = await searchParams;
  const [services, staff, customer] = await Promise.all([
    prisma.service.findMany({ where: { shopId: shop.id, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    prisma.staff.findMany({
      where: { shopId: shop.id, active: true, takesAppointments: true, ...(seesOnlyOwnAgenda(me.role) && { id: me.id }) },
      include: { services: true }, orderBy: { name: "asc" },
    }),
    sp.cliente ? prisma.customer.findFirst({ where: { id: sp.cliente, shopId: shop.id } }) : null,
  ]);
  const preferred = customer?.preferredStaffId && staff.some((s) => s.id === customer.preferredStaffId) ? customer.preferredStaffId : undefined;

  return (
    <>
      <PageHeader title="Nueva cita" back={{ href: "/agenda", label: "Agenda" }} />
      <NewAppointmentForm
        tz={shop.timezone}
        initialDate={isDate(sp.d) ? sp.d : today(shop.timezone)}
        initialStaff={sp.staff ?? preferred}
        initialCustomer={customer && { phone: customer.phone, name: customer.name }}
        services={services.map((s) => ({ id: s.id, name: s.name, minutes: s.minutes, price: Number(s.price) }))}
        staff={staff.map((s) => ({ id: s.id, name: s.name, serviceIds: s.services.map((x) => x.serviceId) }))}
      />
    </>
  );
}
