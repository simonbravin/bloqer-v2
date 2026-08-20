import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";

export default function CronogramaLoading() {
  return (
    <div className="space-y-4">
      <div className="lg:hidden">
        <ListSectionSkeleton variant="cards" rows={4} />
      </div>
      <div className="hidden lg:block">
        <ListSectionSkeleton />
      </div>
    </div>
  );
}
