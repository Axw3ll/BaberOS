import { ToastProvider } from "@/components/ui";
import BookingFlow from "@/components/BookingFlow";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <ToastProvider>
      <main style={{ maxWidth: 520, margin: "0 auto" }}>
        <BookingFlow slug={slug} />
      </main>
    </ToastProvider>
  );
}
