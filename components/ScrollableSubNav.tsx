"use client"

import Link from "next/link"

type LinkItem = {
  href: string
  label: string
  exact?: boolean
}

type Props = {
  links: LinkItem[]
  isActive: (href: string, exact?: boolean) => boolean
  className?: string
}

export default function ScrollableSubNav({ links, isActive, className = "" }: Props) {
  return (
    <nav className={`-mx-4 mb-6 overflow-x-auto border-b border-slate-200 px-4 pb-3 sm:mx-0 sm:px-0 ${className}`}>
      <div className="flex w-max min-w-full gap-2">
        {links.map(({ href, label, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
