import { LoadingRegion, PageHeaderSkeleton, FormSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton title="Nouvelle Consultation" />
      <FormSkeleton fields={8} />
    </LoadingRegion>
  );
}
