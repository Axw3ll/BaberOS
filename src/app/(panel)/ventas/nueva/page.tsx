import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Pos, type PosLine } from "./pos";
import { stampRewardLabel } from "@/lib/loyalty";

export const metadata = { title: "Nueva venta" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ cita?: string; cliente?: string }> }) {
  const { shop, me } = await requireSection("ventas");
  const { cita, cliente } = await searchParams;

  const [services, products, staff, appt, packages] = await Promise.all([
    prisma.service.findMany({ where: { shopId: shop.id, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    prisma.product.findMany({ where: { shopId: shop.id, active: true }, orderBy: { name: "asc" } }),
    prisma.staff.findMany({ where: { shopId: shop.id, active: true }, orderBy: { name: "asc" } }),
    cita
      ? prisma.appointment.findFirst({ where: { id: cita, shopId: shop.id, sale: null }, include: { services: true, customer: true } })
      : null,
    prisma.package.findMany({ where: { shopId: shop.id, active: true }, orderBy: { price: "asc" } }),
  ]);
  const apptPackages = appt ? await prisma.customerPackage.findMany({
    where: { customerId: appt.customerId, status: "ACTIVE", expiresAt: { gt: new Date() }, OR: [{ usesLeft: null }, { usesLeft: { gt: 0 } }] },
    orderBy: { expiresAt: "asc" },
  }) : [];

  // Cliente sin cita: "lo de siempre" = servicios de su última visita, con su barbero
  const regular = !appt && cliente
    ? await prisma.customer.findFirst({
        where: { id: cliente, shopId: shop.id },
        include: { appointments: { where: { status: "COMPLETED" }, orderBy: { startsAt: "desc" }, take: 1, include: { services: true } } },
      })
    : null;
  const last = regular?.appointments[0];
  const regularStaff = regular?.preferredStaffId ?? last?.staffId ?? null;

  const initial: PosLine[] = appt
    ? appt.services.map((s) => ({ key: s.id, kind: "SERVICE", refId: s.serviceId, name: s.name, price: Number(s.price), quantity: 1, staffId: appt.staffId }))
    : last
      ? last.services
          .map((s) => services.find((x) => x.id === s.serviceId))
          .filter((s): s is (typeof services)[number] => Boolean(s))
          .map((s) => ({ key: s.id, kind: "SERVICE" as const, refId: s.id, name: s.name, price: Number(s.price), quantity: 1, staffId: regularStaff }))
      : [];

  return (
    <>
      <PageHeader
        title={appt ? `Cobrar a ${appt.customer.name}` : regular ? `Cobrar a ${regular.name}` : "Nueva venta"}
        back={appt ? { href: `/citas/${appt.id}`, label: "Cita" } : { href: "/ventas", label: "Ventas" }}
      />
      <Pos
        me={me.id}
        loyalty={{
          mode: shop.loyaltyMode,
          pesoPerPoint: Number(shop.loyaltyPesoPerPoint),
          stamps: { required: shop.stampsRequired, reward: shop.stampReward, value: Number(shop.stampRewardValue), min: Number(shop.stampMinAmount), label: stampRewardLabel(shop) },
        }}
        customerLoyalty={appt ? {
          points: appt.customer.points, stamps: appt.customer.stamps, rewards: appt.customer.stampRewards,
          packages: apptPackages.map((p) => ({ id: p.id, name: p.name, usesLeft: p.usesLeft, expiresAt: p.expiresAt.toISOString(), serviceIds: p.serviceIds })),
        } : null}
        packages={packages.map((p) => ({ id: p.id, name: p.name, price: Number(p.price), sub: p.kind === "BUNDLE" ? `${p.uses} servicios · ${p.days} días` : `Ilimitado · ${p.days} días` }))}
        appointmentId={appt?.id ?? null}
        initial={initial}
        initialCustomer={regular ? { phone: regular.phone, name: regular.name } : null}
        maxDiscountPct={me.role === "BARBER" ? shop.maxDiscountBarber : me.role === "RECEPTIONIST" ? shop.maxDiscountReception : null}
        services={services.map((s) => ({ id: s.id, name: s.name, price: Number(s.price) }))}
        products={products.map((p) => ({ id: p.id, name: p.name, brand: p.brand, price: Number(p.price), stock: p.stock }))}
        staff={staff.filter((s) => s.role !== "RECEPTIONIST").map((s) => ({ id: s.id, name: s.name }))}
      />
    </>
  );
}
