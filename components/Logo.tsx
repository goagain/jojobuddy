export function BrandMark() {
  return (
    <span className="inline-flex items-center gap-2 md:gap-2.5">
      <img
        src="/jotaro-hat-mark.png"
        alt=""
        className="h-11 w-auto select-none md:h-[3.35rem]"
        draggable={false}
      />
      <img
        src="/jotaro-diu-mark.png"
        alt=""
        className="h-11 w-auto select-none md:h-[3.35rem]"
        draggable={false}
      />
      <span className="display text-4xl font-black tracking-[0.12em] md:text-5xl">BUDDY</span>
    </span>
  );
}
