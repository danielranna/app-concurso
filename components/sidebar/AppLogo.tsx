/** Logo nítida: img nativa evita recompressão do next/image em tamanhos pequenos. */
export default function AppLogo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Via Aprovação"
      width={32}
      height={32}
      decoding="async"
      className={`shrink-0 object-contain ${className}`}
    />
  )
}
