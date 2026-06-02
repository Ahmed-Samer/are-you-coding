import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AnalyticsWindow = 7 | 30 | 90 | 365;

export function AnalyticsWindowSelector({
  value,
  onChange,
}: {
  value: AnalyticsWindow;
  onChange: (v: AnalyticsWindow) => void;
}) {
  return (
    <Tabs value={String(value)} onValueChange={(v) => onChange(parseInt(v, 10) as AnalyticsWindow)}>
      <TabsList>
        <TabsTrigger value="7">7d</TabsTrigger>
        <TabsTrigger value="30">30d</TabsTrigger>
        <TabsTrigger value="90">90d</TabsTrigger>
        <TabsTrigger value="365">12mo</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}