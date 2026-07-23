import Link from "next/link";

export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="Onboarding OS home">
      <span className="brand-mark" aria-hidden="true">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a5 5 0 0 1 5 5v1h1a3 3 0 0 1 0 6h-1v1a5 5 0 0 1-10 0v-1H6a3 3 0 0 1 0-6h1V7a5 5 0 0 1 5-5z" />
          <circle cx="9.5" cy="11" r="0.5" fill="currentColor" />
          <circle cx="14.5" cy="11" r="0.5" fill="currentColor" />
        </svg>
      </span>
      <span className="brand-name">
        Onboarding <span className="brand-ver">OS</span>
      </span>
    </Link>
  );
}
