"use client";

import { useI18n } from "@/components/LocaleProvider";

export function SRankOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <button
      type="button"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
    >
      <div className="relative max-w-xl rotate-[-2deg] border-4 border-black bg-gradient-to-br from-[#ffe9a3] via-[#f0c75e] to-[#c9892a] px-10 py-8 text-center shadow-[12px_12px_0_#000]">
        <p className="display text-sm tracking-[0.4em] text-black/70">GOLDEN EXPERIENCE</p>
        <p className="display mt-2 text-7xl font-black text-black">S</p>
        <p className="mt-2 text-2xl font-black tracking-widest text-black">{t("sRankTitle")}</p>
        <p className="mt-3 text-sm font-bold text-black/70">{t("sRankBody")}</p>
      </div>
    </button>
  );
}
