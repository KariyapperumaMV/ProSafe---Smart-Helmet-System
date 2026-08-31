// riskTrend/environment trend buckets are either "HH:00" (daily/hourly) or
// "YYYY-MM-DD" (weekly/monthly) — shared by every Analytics chart so the two
// never format the same bucket two different ways.
export function formatBucketLabel(bucket, granularity) {
  if (granularity === "hour") return bucket;
  const d = new Date(`${bucket}T00:00:00`);
  if (Number.isNaN(d.getTime())) return bucket;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
