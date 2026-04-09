function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200/90 ${className}`} />
}

export function ListingCardSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm"
      aria-hidden="true"
    >
      <Bone className="h-[200px] w-full !rounded-none rounded-t-2xl" />

      <div className="space-y-3 p-4">
        <Bone className="h-8 w-2/3" />
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-4/5" />
        <Bone className="h-3.5 w-1/2" />

        <div className="flex gap-2 border-t border-zinc-100 pt-3">
          <Bone className="h-12 flex-1 !rounded-xl" />
          <Bone className="h-12 w-12 !rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export function ListingSkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 pb-4">
      {Array.from({ length: count }, (_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  )
}
