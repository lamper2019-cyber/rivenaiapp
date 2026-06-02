"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  // Four tabs. RIVEN's coaching surfaces through the Message-from-RIVEN
  // bubble at the top of /dashboard (tap it → opens /chat thread, no
  // bottom-nav slot needed). RIVEN AI is the user ↔ AI assistant for
  // voice meal logging + nutrition questions.
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/log", label: "Log", icon: "edit_note" },
  { href: "/ai", label: "RIVEN AI", icon: "auto_awesome" },
  { href: "/profile", label: "Profile", icon: "person" },
];

export function BottomNav({ mealsBehind = false }: { mealsBehind?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pt-4 pb-safe bg-cream/85 backdrop-blur-xl shadow-nav-top rounded-t-xl border-t border-outline-variant/40"
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const showLogDot = item.href === "/log" && mealsBehind && !isActive;
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
            <span className="relative inline-block">
              <span
                className={`material-symbols-outlined ${isActive ? "filled" : ""}`}
              >
                {item.icon}
              </span>
              {showLogDot && (
                <span
                  aria-label="You're behind on logging today"
                  className="absolute -top-0.5 -right-1 inline-block w-2 h-2 rounded-full bg-gold ring-2 ring-cream"
                />
              )}
            </span>
            <span className="font-body text-label-md mt-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
