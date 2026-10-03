import { LoadingRegion, PageHeaderSkeleton, ListSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Assistant Clinique IA" />
      <ListSkeleton rows={4} />
    </LoadingRegion>
  );
}
