import Link from "next/link";

export type FooterLink = { href: string; label: string };

export function SiteFooter({ links }: { links: FooterLink[] }) {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>© 2026 Onboarding OS</p>
        <nav aria-label="Footer">
          {links.map((link) => (
            <Link key={link.href + link.label} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
