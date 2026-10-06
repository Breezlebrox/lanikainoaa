import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import type { TideData } from "./models";
import { timeLabel } from "./utils";
export function TideChart({
  data,
  zone,
  now,
}: {
  data: TideData;
  zone: string;
  now: number;
}) {
  const start = now - 6 * 3600000,
    end = start + 48 * 3600000;
  const samples = data.samples.filter((p) => p.time >= start && p.time <= end);
  if (!samples.length)
    return (
      <p className="empty">
        This subordinate station publishes high and low tides only. Choose a
        reference station below for a continuous curve.
      </p>
    );
  return (
    <div
      className="chart"
      role="img"
      aria-label="48-hour predicted tide in feet above mean lower low water"
    >
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart
          data={samples}
          margin={{ top: 35, right: 28, bottom: 5, left: -20 }}
        >
          <defs>
            <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--teal)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            type="number"
            domain={[start, end]}
            scale="time"
            tickFormatter={(t) => timeLabel(t, zone)}
            tick={{ fontSize: 12, fill: "var(--muted)" }}
            minTickGap={45}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}′`}
            domain={["auto", "auto"]}
            tick={{ fontSize: 12, fill: "var(--muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(t) => timeLabel(Number(t), zone)}
            formatter={(v) => [`${Number(v).toFixed(2)} ft`, "Predicted tide"]}
            contentStyle={{
              background: "var(--paper)",
              border: "1px solid var(--line)",
              borderRadius: 8,
            }}
          />
          <Area
            dataKey="height"
            type="monotone"
            stroke="var(--teal)"
            strokeWidth={2.5}
            fill="url(#tideFill)"
            isAnimationActive={false}
          />
          <ReferenceLine
            x={now}
            stroke="var(--muted)"
            strokeDasharray="3 4"
            label={{
              value: "NOW",
              position: "insideTopRight",
              fill: "var(--muted)",
              fontSize: 11,
            }}
          />
          {data.events
            .filter((e) => e.time >= start && e.time <= end)
            .map((e) => (
              <ReferenceDot
                key={e.time}
                x={e.time}
                y={e.height}
                r={3}
                fill="var(--teal)"
                stroke="var(--paper)"
                label={{
                  value: `${e.kind === "High" ? "H" : "L"} ${e.height.toFixed(1)}′`,
                  position: e.kind === "High" ? "top" : "bottom",
                  fontSize: 11,
                  fill: "var(--muted)",
                }}
              />
            ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
