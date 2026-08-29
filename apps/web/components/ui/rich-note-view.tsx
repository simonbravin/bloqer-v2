import { parseRichNote, type RichNoteInline } from "@bloqer/utils";
import { cn } from "@/lib/utils";

function RichNoteInlines({ nodes }: { nodes: RichNoteInline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === "text") return <span key={i}>{node.text}</span>;
        if (node.type === "br") return <br key={i} />;
        return (
          <strong key={i}>
            <RichNoteInlines nodes={node.children} />
          </strong>
        );
      })}
    </>
  );
}

export function RichNoteView({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const blocks = parseRichNote(value);
  if (blocks.length === 0) return null;

  return (
    <div className={cn("space-y-2 text-sm [&_strong]:font-semibold", className)}>
      {blocks.map((block, i) => {
        if (block.type === "p") {
          return (
            <p key={i} className="whitespace-pre-wrap">
              <RichNoteInlines nodes={block.children} />
            </p>
          );
        }
        const List = block.type === "ul" ? "ul" : "ol";
        return (
          <List
            key={i}
            className={cn(
              "space-y-1 pl-5",
              block.type === "ul" ? "list-disc" : "list-decimal",
            )}
          >
            {block.items.map((item, j) => (
              <li key={j}>
                <RichNoteInlines nodes={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
