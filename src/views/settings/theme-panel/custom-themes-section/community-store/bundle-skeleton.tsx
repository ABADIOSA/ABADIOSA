export function BundleSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="harbor-skel min-h-[380px] w-full rounded-[14px] bg-elevated/40" />
      <div className="flex flex-col gap-8 ps-[9px]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="harbor-skel h-8 w-44 rounded-full bg-elevated/40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="harbor-skel h-8 w-24 rounded-full bg-elevated/35" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <div className="harbor-skel h-3 w-32 rounded bg-elevated/35" />
          <div className="flex gap-5 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex w-[252px] shrink-0 flex-col gap-2.5">
                <div className="harbor-skel aspect-[16/10] w-full rounded-[14px] bg-elevated/40" />
                <div className="flex flex-col gap-1.5 px-1">
                  <div className="harbor-skel h-3 w-3/5 rounded bg-elevated/35" />
                  <div className="harbor-skel h-3 w-2/5 rounded bg-elevated/25" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
