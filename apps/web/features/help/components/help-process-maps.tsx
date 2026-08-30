"use client";

import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  HELP_PROCESS_MAP_KIND_LABEL,
  HELP_PROCESS_MAP_LEVEL_LABEL,
  listHelpProcessMaps,
  type HelpProcessMap,
  type HelpProcessMapKind,
} from "@/features/help/lib/process-maps";

function MapCard({ map }: { map: HelpProcessMap }) {
  return (
    <li>
      <Link
        href={`/ayuda/${map.articleSlug}`}
        className="block overflow-hidden rounded-lg border bg-card transition-colors hover:bg-muted/40"
      >
        <div className="relative aspect-[16/11] bg-muted/40">
          <Image
            src={map.imageSrc}
            alt={map.title}
            fill
            sizes="(min-width: 768px) 360px, 100vw"
            className="object-cover object-top"
          />
        </div>
        <div className="space-y-1.5 px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug">{map.title}</h3>
            <Badge variant="secondary" className="shrink-0 font-normal">
              {HELP_PROCESS_MAP_LEVEL_LABEL[map.level]}
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{map.summary}</p>
        </div>
      </Link>
    </li>
  );
}

function KindBlock({ kind, blurb }: { kind: HelpProcessMapKind; blurb: string }) {
  const company = listHelpProcessMaps("company", kind);
  const project = listHelpProcessMaps("project", kind);
  if (company.length === 0 && project.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{HELP_PROCESS_MAP_KIND_LABEL[kind]}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Nivel empresa
          </p>
          <ul className="space-y-3">
            {company.map((map) => (
              <MapCard key={map.id} map={map} />
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Nivel obra
          </p>
          <ul className="space-y-3">
            {project.map((map) => (
              <MapCard key={map.id} map={map} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function HelpProcessMapsGallery() {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Mapas de proceso</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Primero el caminito (si esto, entonces aquello). Después la lámina con roles y detalle.
        </p>
      </div>
      <KindBlock kind="flow" blurb="Cómo se mueve el documento: qué sigue si sí y qué pasa si no." />
      <KindBlock kind="lamina" blurb="Misma historia, con pasos, roles y contra más desarrollados." />
    </section>
  );
}
