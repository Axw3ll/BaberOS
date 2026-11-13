import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { ServiceFields } from "@/components/service-fields";
import { toggleService, updateService } from "../actions";

export const metadata = { title: "Servicio" };

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { shop } = await requireSection("servicios");
  const [s, staff] = await Promise.all([
    prisma.service.findFirst({ where: { id, shopId: shop.id }, include: { staff: true } }),
    prisma.staff.findMany({ where: { shopId: shop.id, active: true, takesAppointments: true }, orderBy: { name: "asc" } }),
  ]);
  if (!s) notFound();

  return (
    <>
      <PageHeader back={{ href: "/servicios", label: "Servicios" }} title={s.name}
        actions={
          <form action={toggleService}>
            <input type="hidden" name="id" value={s.id} />
            <button className="btn-ghost text-sm">{s.active ? "Pausar servicio" : "Reactivar servicio"}</button>
          </form>
        } />
      <ActionForm action={updateService} className="max-w-2xl">
        <input type="hidden" name="id" value={s.id} />
        <ServiceFields s={{ ...s, price: s.price.toString() }} staff={staff} assigned={s.staff.map((x) => x.staffId)} />
        <div className="mt-8"><Submit>Guardar cambios</Submit></div>
      </ActionForm>
    </>
  );
}
