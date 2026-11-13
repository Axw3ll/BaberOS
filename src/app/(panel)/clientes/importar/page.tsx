import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Importer } from "./importer";

export const metadata = { title: "Importar clientes" };

export default async function ImportarPage() {
  const { me } = await requireSection("clientes");
  if (me.role === "BARBER") redirect("/clientes");
  return (
    <>
      <PageHeader back={{ href: "/clientes", label: "Clientes" }} title="Importar clientes"
        subtitle="Trae tu lista desde Excel, Google Sheets u otro sistema en un minuto." />
      <Importer />
    </>
  );
}
