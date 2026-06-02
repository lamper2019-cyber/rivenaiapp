"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTransition, type ReactNode } from "react";

type TabId = "overview" | "meals" | "trends" | "chat" | "weekly";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "meals", label: "Meals" },
  { id: "trends", label: "Trends" },
  { id: "chat", label: "Chat" },
  { id: "weekly", label: "Weekly" },
];

export function CoachClientTabs({
  overview,
  meals,
  trends,
  chat,
  weekly,
}: {
  overview: ReactNode;
  meals: ReactNode;
  trends: ReactNode;
  chat: ReactNode;
  weekly: ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const rawTab = params.get("tab");
  const activeTab: TabId =
    TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "overview";

  const setTab = (next: TabId) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", next);
    startTransition(() => {
      // scroll: false keeps RIVEN's eye on the tab bar instead of yanking him
      // back to the top of the page on every tab switch.
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  };

  const content: Record<TabId, ReactNode> = { overview, meals, trends, chat, weekly };

  return (
    <div className="space-y-section-gap">
      <nav
        role="tablist"
        aria-label="Client sections"
        className="flex gap-2 overflow-x-auto pb-1 -mx-container-mobile px-container-mobile md:mx-0 md:px-0"
      >
        {TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-4 py-2 rounded-full font-body text-label-md tracking-wide transition-all ${
                isActive
                  ? "bg-charcoal text-cream"
                  : "bg-surface-container-lowest border border-outline-variant/60 text-on-surface-variant hover:text-charcoal hover:border-charcoal/40"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      <div role="tabpanel">{content[activeTab]}</div>
    </div>
  );
}
