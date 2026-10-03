import { LoadingRegion, PageHeaderSkeleton, TextSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <TextSkeleton paragraphs={5} />
    </LoadingRegion>
  );
}
