export function AnnotationIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3.25 16.75C5.1 14.9 7.2 11.15 9.05 8.65C10.25 7.05 11.2 6.2 11.85 6.55C12.65 6.98 11.45 9.55 10.25 11.75C9.05 13.95 8.1 16.05 8.85 16.45C9.85 16.98 12.2 12.75 13.55 11.45C14.45 10.58 15.2 10.35 15.5 10.85C15.95 11.58 14.15 14.45 14.65 15.25C15.1 15.98 17.15 13.55 18.15 13.25C18.85 13.05 19.05 13.8 19.65 14.25C20.05 14.55 20.55 14.6 20.9 14.3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
