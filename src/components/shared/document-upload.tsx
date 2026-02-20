"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { WorkDocument, DocumentType } from "@/types";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import { Upload, X, FileText, Image } from "lucide-react";

const DEFAULT_DOCUMENT_TYPES: DocumentType[] = [
  "contract",
  "wardrobe_photo",
  "other",
  "paystub",
];

interface DocumentUploadProps {
  documents: WorkDocument[];
  onUpload: (doc: WorkDocument) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  /** Override which document types to show. Defaults to contract, wardrobe_photo, other, paystub */
  documentTypes?: DocumentType[];
}

export function DocumentUpload({
  documents,
  onUpload,
  onRemove,
  disabled = false,
  documentTypes = DEFAULT_DOCUMENT_TYPES,
}: DocumentUploadProps) {
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: DocumentType
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingType(docType);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const { filename } = await res.json();

      const doc: WorkDocument = {
        filename,
        originalName: file.name,
        documentType: docType,
        uploadedAt: new Date().toISOString(),
      };

      onUpload(doc);
      toast.success(`${file.name} uploaded!`);
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setUploadingType(null);
      // Reset file input so same file can be selected again
      const ref = fileInputRefs.current[docType];
      if (ref) {
        ref.value = "";
      }
    }
  };

  const getFileIcon = (docType: DocumentType) => {
    if (docType === "wardrobe_photo" || docType === "exhibit_g") {
      return <Image className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  // Get documents already uploaded for a given type
  const docsForType = (docType: DocumentType) =>
    documents
      .map((doc, i) => ({ doc, index: i }))
      .filter(({ doc }) => doc.documentType === docType);

  return (
    <div className="space-y-3">
      {/* One row per document type */}
      {documentTypes.map((docType) => {
        const uploaded = docsForType(docType);
        const isUploading = uploadingType === docType;

        return (
          <div key={docType} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm shrink-0">
                {DOCUMENT_TYPE_LABELS[docType]}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || isUploading}
                onClick={() => fileInputRefs.current[docType]?.click()}
              >
                <Upload className="mr-2 h-3 w-3" />
                {isUploading ? "Uploading..." : "Choose File"}
              </Button>
              <input
                ref={(el) => {
                  fileInputRefs.current[docType] = el;
                }}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => handleFileSelect(e, docType)}
                disabled={disabled || isUploading}
              />
            </div>

            {/* Show uploaded files for this type */}
            {uploaded.length > 0 && (
              <div className="pl-4 space-y-1">
                {uploaded.map(({ doc, index }) => (
                  <div
                    key={`${doc.filename}-${index}`}
                    className="flex items-center justify-between p-1.5 rounded-md bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(doc.documentType)}
                      <span className="text-sm truncate">
                        {doc.originalName}
                      </span>
                    </div>
                    {!disabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={() => onRemove(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
}
