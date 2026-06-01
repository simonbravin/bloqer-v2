"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DocumentForm, type DocumentFormProps } from "./document-form";

type Props = DocumentFormProps & {
  triggerLabel?: string;
  title?: string;
  description?: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "default" | "sm";
  showPlusIcon?: boolean;
};

export function DocumentUploadDialog({
  triggerLabel = "Adjuntar",
  title = "Adjuntar archivo",
  description,
  triggerVariant = "default",
  triggerSize = "sm",
  showPlusIcon = false,
  ...formProps
}: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [uploading, setUploading] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next && uploading) return;
    setOpen(next);
    if (!next) {
      setFormKey((k) => k + 1);
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize} className="gap-1.5">
          {showPlusIcon ? <Plus className="h-4 w-4" aria-hidden /> : null}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (uploading) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (uploading) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DocumentForm
          key={formKey}
          {...formProps}
          layout="dialog"
          onSuccess={() => handleOpenChange(false)}
          onCancel={() => handleOpenChange(false)}
          onPendingChange={setUploading}
        />
      </DialogContent>
    </Dialog>
  );
}
