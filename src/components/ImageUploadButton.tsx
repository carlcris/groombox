import { useId, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findImageProblem, imageInputAccept } from "@/lib/stored-images";
import { messages } from "@/lib/messages";

// Picks one image, checks its type and size, and hands it on. Problems show under the button.
export function ImageUploadButton({
  label,
  isUploading,
  onImage,
}: {
  label: string;
  isUploading: boolean;
  onImage: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={imageInputAccept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const found = findImageProblem(file);
          setProblem(found === "type" ? messages.validation.imageType : found === "size" ? messages.validation.imageSize : null);
          if (!found) onImage(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={isUploading}
        aria-describedby={problem ? errorId : undefined}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus aria-hidden />
        {isUploading ? messages.setup.uploading : label}
      </Button>
      {problem ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
