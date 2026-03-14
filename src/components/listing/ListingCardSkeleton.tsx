function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
}

export function ListingCardSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[560px] overflow-hidden rounded-lg border border-black/10 bg-white/70 shadow-[0_14px_45px_rgba(15,23,42,0.10)]"
      aria-hidden="true"
    >
      <Bone className="h-48 w-full !rounded-none" />

      <div className="space-y-3 border-t border-black/10 bg-white/60 p-4">
        <div className="space-y-2">
          <Bone className="h-5 w-3/4" />
          <Bone className="h-3.5 w-1/2" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Bone className="h-3 w-20" />
          <Bone className="h-3 w-28" />
          <Bone className="h-3 w-24" />
          <Bone className="h-3 w-24" />
        </div>

        <div className="flex items-center justify-between">
          <Bone className="h-7 w-36" />
          <Bone className="h-10 w-28 !rounded-xl" />
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
