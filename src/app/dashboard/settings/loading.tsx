import { LoadingRegion, PageHeaderSkeleton, FormSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <FormSkeleton fields={4} />
    </LoadingRegion>
  );
}
