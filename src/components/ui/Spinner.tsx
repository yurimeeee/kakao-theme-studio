export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block rounded-full border-2 border-current border-r-transparent ${className}`}
      style={{ animation: 'spin 0.8s linear infinite' }}
    />
  )
}
