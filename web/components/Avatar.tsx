"use client";

function stringToColor(name: string): string {
  const colors = [
    "bg-accent", "bg-info", "bg-ok", "bg-danger",
    "bg-warn", "bg-danger", "bg-info", "bg-teal-500",
    "bg-warn", "bg-cyan-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} ${stringToColor(name)} rounded-full flex items-center justify-center text-on-solid font-semibold shrink-0`}>
      {initials(name || "?")}
    </div>
  );
}
