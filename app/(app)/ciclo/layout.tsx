import CicloLayoutClient from "@/components/ciclo/CicloLayoutClient"

export default function CicloLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <CicloLayoutClient>{children}</CicloLayoutClient>
}
