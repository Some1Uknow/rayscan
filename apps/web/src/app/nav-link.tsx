"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  href: string;
  label: string;
  activePrefixes?: string[];
};

export function NavLink({ href, label, activePrefixes = [] }: Props) {
  const pathname = usePathname();

  const isActive =
    pathname === href ||
    activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return (
    <Link className={`header-nav-link${isActive ? " header-nav-link-active" : ""}`} href={href}>
      {label}
    </Link>
  );
}
