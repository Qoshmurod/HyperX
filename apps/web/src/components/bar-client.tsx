'use client';

import { BarChart, Series } from './charts';

export function BarChartClient(props: { labels: string[]; series: Series[] }) {
  return <BarChart {...props} height={200} />;
}
