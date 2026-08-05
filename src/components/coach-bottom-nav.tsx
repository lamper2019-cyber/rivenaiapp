"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  matches?: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/coach/clients",
    label: "Clients",
    icon: "groups",
    matches: (p) => p === "/coach" || p.startsWith("/coach/clients"),
  },
  {
    href: "/coach/messages",
    label: "Messages",
    icon: "forum",
    matches: (p) => p.startsWith("/coach/messages"),
  },
  {
    href: "/coach/leads",
    label: "Leads",
    icon: "person_search",
    matches: (p) => p.startsWith("/coach/leads"),
  },
  {
    href: "/coach/insights",
    label: "Insights",
    icon: "insights",
    matches: (p) => p.startsWith("/coach/insights"),
  },
  {
    href: "/coach/train",
    label: "Train",
    icon: "fitness_center",
    matches: (p) => p.startsWith("/coach/train"),
  },
  { href: "/coach/profile", label: "Profile", icon: "person" },
];

// px-3 (the client nav uses px-6): six tabs need the extra room on a phone,
// otherwise the labels collide.
export function CoachBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-3 pt-4 pb-safe bg-cream/85 backdrop-blur-xl shadow-nav-top rounded-t-xl border-t border-outline-variant/40"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.matches
          ? item.matches(pathname)
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center transition-all active:scale-95 duration-200 ${
              isActive
                ? "text-charcoal scale-110"
                : "text-on-primary-container opacity-60 hover:opacity-100"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <span
              className={`material-symbols-outlined ${isActive ? "filled" : ""}`}
            >
              {item.icon}
            </span>
            <span className="font-body text-label-md mt-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
