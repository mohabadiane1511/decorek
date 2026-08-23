import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { WhatsAppButton } from "./WhatsAppButton";

export function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}

export function PageHeader({
  title,
  intro,
  index,
  aside,
}: {
  title: string;
  intro?: string;
  index?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-12 pb-8 sm:px-6 sm:pt-16">
      {index && <p className="section-index">{index}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <h1 className="title-xl">{title}</h1>
        {aside && <div className="label-mono text-muted-foreground sm:text-right">{aside}</div>}
      </div>
      {intro && <p className="mt-6 max-w-2xl text-muted-foreground">{intro}</p>}
      <div className="mt-8 border-b border-border" />
    </div>
  );
}
