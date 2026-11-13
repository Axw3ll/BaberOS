import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Pos, type PosLine } from "./pos";

export const metadata = { title: "Nueva venta" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ cita?: string }> }) {
  const { shop, me } = await requireSection("ventas");
  const { cita } = await searchParams;

  const [services, products, staff, appt] = await Promise.all([
    prisma.service.findMany({ where: { shopId: shop.id, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    prisma.product.findMany({ where: { shopId: shop.id, active: true }, orderBy: { name: "asc" } }),
    prisma.staff.findMany({ where: { shopId: shop.id, active: true }, orderBy: { name: "asc" } }),
    cita
      ? prisma.appointment.findFirst({ where: { id: cita, shopId: shop.id, sale: null }, include: { services: true, customer: true } })
      : null,
  ]);

  const initial: PosLine[] = appt
    ? appt.services.map((s) => ({ key: s.id, kind: "SERVICE", refId: s.serviceId, name: s.name, price: Number(s.price), quantity: 1, staffId: appt.staffId }))
    : [];

  return (
    <>
      <PageHeader
        title={appt ? `Cobrar a ${appt.customer.name}` : "Nueva venta"}
        back={appt ? { href: `/citas/${appt.id}`, label: "Cita" } : { href: "/ventas", label: "Ventas" }}
      />
      <Pos
        me={me.id}
        loyalty={Number(shop.loyaltyPointsPerPeso) > 0 ? { pesoPerPoint: Number(shop.loyaltyPesoPerPoint) } : null}
        customerPoints={appt?.customer.points ?? null}
        appointmentId={appt?.id ?? null}
        initial={initial}
        services={services.map((s) => ({ id: s.id, name: s.name, price: Number(s.price) }))}
        products={products.map((p) => ({ id: p.id, name: p.name, brand: p.brand, price: Number(p.price), stock: p.stock }))}
        staff={staff.filter((s) => s.role !== "RECEPTIONIST").map((s) => ({ id: s.id, name: s.name }))}
      />
    </>
  );
}
