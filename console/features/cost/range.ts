/**
 * `/api/usage` 的范围查询串，以及这个范围能选的粒度。日期一律按部署时区解释:预设档只发 `days`,由服务端取部署时区
 * 的今天往前数;自定义档发两个日期框里的 `YYYY-MM-DD`。浏览器时区不参与。
 */

import type { UsageBucketOption, UsageBucketUnit } from './types.ts';

export interface UsageRange {
  from: string;
  to: string;
}

/** `days === 0` 是自定义档,读 `custom`,空串不出现在 URL 里;其余档是含今天的最近 N 天。 */
export function usageQuery(bucket: string, days: number, custom: UsageRange): string {
  const q = new URLSearchParams();
  q.set('bucket', bucket);
  if (days > 0) {
    q.set('days', String(days));
    return q.toString();
  }
  if (custom.from) q.set('from', custom.from);
  if (custom.to) q.set('to', custom.to);
  return q.toString();
}

/**
 * The most bars the trend chart draws: three days by the minute, which draws in about 170 ms with every bar
 * stacked three ways. A finer pick over a longer range is not offered.
 */
export const MAX_BUCKETS = 4320;
const UNIT_MINUTES: Record<UsageBucketUnit, number> = { minute: 1, hour: 60, day: 1440, week: 10080, month: 43200 };
const DAY_MS = 86_400_000;

/** Days the range covers, both ends included; NaN while either end of a custom range is open. */
export function rangeDays(days: number, custom: UsageRange): number {
  if (days > 0) return days;
  const from = Date.parse(custom.from), to = Date.parse(custom.to);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.max(1, Math.round((to - from) / DAY_MS) + 1) : NaN;
}

/**
 * Whether `bucket` keeps `span` days within MAX_BUCKETS. `auto` always does; over an unknown span (an open custom
 * range, which may reach back to the first record) only a day or coarser is offered.
 */
export function bucketFits(bucket: UsageBucketOption, span: number): boolean {
  if (bucket === 'auto') return true;
  if (!Number.isFinite(span)) return UNIT_MINUTES[bucket] >= UNIT_MINUTES.day;
  return Math.ceil(span * 1440 / UNIT_MINUTES[bucket]) <= MAX_BUCKETS;
}
