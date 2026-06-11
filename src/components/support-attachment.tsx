import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "support-attachments";

/**
 * Resolve a stored attachment reference into a renderable URL.
 * - If `ref` starts with http(s), it is returned as-is (legacy public URLs).
 * - Otherwise it is treated as a storage path inside the support-attachments
 *   bucket and a short-lived signed URL is generated.
 */
async function resolveUrl(ref: string): Promise<string | null> {
  if (/^https?:\/\//i.test(ref)) {
    // Legacy public URL — try to convert to a signed URL if it points at the
    // private bucket, otherwise return it untouched.
    const match = ref.match(/\/support-attachments\/(.+)$/);
    if (!match) return ref;
    const path = decodeURIComponent(match[1].split("?")[0]);
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? ref;
  }
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(ref, 60 * 60);
  return data?.signedUrl ?? null;
}

export function SupportAttachment({
  attachment,
  type,
}: {
  attachment: string;
  type?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveUrl(attachment).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [attachment]);

  if (!url) {
    return <div className="text-xs opacity-60 mt-1">Loading attachment…</div>;
  }

  if (type?.startsWith("image/")) {
    return <img src={url} alt="attachment" className="rounded mt-1 max-w-full" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="underline text-xs flex items-center gap-1 mt-1"
    >
      <Paperclip className="h-3 w-3" />
      File
    </a>
  );
}
