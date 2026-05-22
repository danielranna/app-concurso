"use client"

type Props = {
  src: string
  alt?: string
  /** study = tela de estudo; editor = criação de oclusão */
  variant?: "study" | "editor"
}

export default function FlashcardImage({ src, alt = "Card", variant = "study" }: Props) {
  const className =
    variant === "study"
      ? "mx-auto w-full max-w-3xl rounded-lg object-contain max-h-[min(75vh,900px)] min-h-[280px]"
      : "w-full max-w-4xl rounded-lg border object-contain max-h-[min(80vh,960px)]"

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} draggable={false} />
  )
}
