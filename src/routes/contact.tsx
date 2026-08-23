import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { ShopLayout, PageHeader } from "@/components/layout/ShopLayout";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — boutique Deco'Rek à Dakar" },
      {
        name: "description",
        content:
          "Joignez Deco'Rek par WhatsApp, téléphone ou email, ou passez à la boutique de Sacré-Cœur 3 à Dakar.",
      },
      { property: "og:title", content: "Contacter Deco'Rek" },
      { property: "og:description", content: "Notre équipe répond du lundi au samedi, 9h-19h." },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { content } = useStore();
  return (
    <ShopLayout>
      <PageHeader title="Nous contacter" />
      <div className="mx-auto max-w-4xl px-4 pb-24">
        <p className="max-w-2xl leading-relaxed text-muted-foreground">{content.pages.contact}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Phone, label: "Téléphone", value: content.phone },
            { icon: Mail, label: "Email", value: content.email },
            { icon: MapPin, label: "Boutique", value: content.address },
          ].map((c) => (
            <div key={c.label} className="border border-border p-5">
              <c.icon className="h-5 w-5 text-orange-brand" strokeWidth={1.5} />
              <p className="mt-3 text-xs tracking-wide text-muted-foreground uppercase">{c.label}</p>
              <p className="mt-1 text-sm">{c.value}</p>
            </div>
          ))}
        </div>
        <a
          href={`https://wa.me/${content.whatsapp}`}
          target="_blank"
          rel="noreferrer"
          className="btn-square btn-solid mt-8"
        >
          Écrire sur WhatsApp
        </a>
      </div>
    </ShopLayout>
  );
}
