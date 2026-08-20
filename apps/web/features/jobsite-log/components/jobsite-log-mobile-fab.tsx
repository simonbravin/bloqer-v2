"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function JobsiteLogMobileFab({ projectId }: { projectId: string }) {
  return (
    <Button
      asChild
      className="fixed bottom-4 right-4 z-40 h-12 min-h-12 rounded-full px-5 shadow-lg md:hidden"
    >
      <Link href={`/proyectos/${projectId}/libro-obra/nuevo`}>
        <Plus className="mr-1 h-4 w-4" aria-hidden />
        Nuevo parte
      </Link>
    </Button>
  );
}
