import { MessageCircle } from "lucide-react";
import { useStore } from "@/lib/store";

export function WhatsAppButton() {
  const { content } = useStore();
  return (
    <a
      href={`https://wa.me/${content.whatsapp}?text=${encodeURIComponent("Bonjour Deco'Rek, j'ai une question sur un article.")}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Nous écrire sur WhatsApp"
      className="fixed bottom-5 right-5 z-50 grid h-13 w-13 place-items-center rounded-full bg-[#25D366] p-3.5 shadow-lg transition-transform hover:scale-105"
    >
      <MessageCircle className="h-6 w-6 text-white" strokeWidth={1.75} />
    </a>
  );
}
