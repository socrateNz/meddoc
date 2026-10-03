import { LoadingRegion, PageHeaderSkeleton, ListSkeleton } from "@/components/ui/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion className="max-w-3xl">
      <PageHeaderSkeleton title="Notifications" actionCount={2} />
      <Skeleton className="h-9 w-72 max-w-full rounded-xl" aria-hidden="true" />
      <ListSkeleton rows={6} />
    </LoadingRegion>
  );
}
