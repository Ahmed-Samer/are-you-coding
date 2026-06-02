import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/store/$slug/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/store/$slug/overview", params: { slug: params.slug } });
  },
});
