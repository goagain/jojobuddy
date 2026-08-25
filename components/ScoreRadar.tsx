"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { Judgment } from "@/lib/schema";
import { useI18n } from "@/components/LocaleProvider";
import type { MessageKey } from "@/lib/i18n";

const LABEL_KEYS: Record<keyof Judgment["scores"], MessageKey> = {
  keywordHit: "dimKeywordShort",
  quantifiedImpact: "dimImpactShort",
  experienceMatch: "dimExperienceShort",
  signalToNoise: "dimNoiseShort",
};

export function ScoreRadar({ scores }: { scores: Judgment["scores"] }) {
  const { t } = useI18n();
  const data = (Object.keys(LABEL_KEYS) as (keyof Judgment["scores"])[]).map((key) => ({
    axis: t(LABEL_KEYS[key]),
    value: scores[key],
  }));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke="rgba(42,27,12,0.25)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: "#2a1b0c", fontSize: 11, fontWeight: 700 }}
          />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke="#6b3cff" fill="#7c68e8" fillOpacity={0.28} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
