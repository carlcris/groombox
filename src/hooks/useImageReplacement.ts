import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { removeStoredImage, uploadImage, type ImageBucket } from "@/lib/stored-images";

// An image picked in a form is uploaded straight away; the row only points at it once the form is
// saved. Afterwards the files no longer pointed at are removed, and closing without saving
// removes what was uploaded. A failed removal only leaves an unused file.
export function useImageReplacement(bucket: ImageBucket, savedPath: string | null, folder: string) {
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const upload = useMutation({
    mutationFn: (file: File) => uploadImage(bucket, folder, file),
    onSuccess: (path) => setUploadedPaths((paths) => [...paths, path]),
  });

  async function removeUnused(keptPath: string | null) {
    const unused = [savedPath, ...uploadedPaths].filter((path): path is string => Boolean(path) && path !== keptPath);
    await Promise.all(unused.map((path) => removeStoredImage(bucket, path)));
  }

  function discardUploads() {
    void Promise.all(uploadedPaths.map((path) => removeStoredImage(bucket, path)));
  }

  return { upload, removeUnused, discardUploads };
}
