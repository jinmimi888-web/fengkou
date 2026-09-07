import { createFileRoute } from "@tanstack/react-router";
import { loadDeskPackByToken } from "@/lib/desk-pack";

export const Route = createFileRoute("/api/pack/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token?.trim() ?? "";
        if (!token) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        const loaded = await loadDeskPackByToken(token);
        if (loaded.status === "missing") {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        if (loaded.status === "expired") {
          return Response.json({ error: "gone" }, { status: 410 });
        }
        return new Response(JSON.stringify(loaded.payload), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": 'attachment; filename="fengkou-pack.json"',
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
