import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { appendToAvatarPack, UPLOADS_ID } from "@/lib/avatars/packs";
import {
  buildGroups,
  entriesFromFileList,
  isNativePick,
  pickFolderNative,
  pickImagesNative,
  setSlug,
  type ImportEntry,
} from "./avatar-import";
import { useT } from "@/lib/i18n";

export function useAvatarImport(section: string) {
  const t = useT();
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [uploadsBadge, setUploadsBadge] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<number>(0);

  useEffect(() => {
    if (section === UPLOADS_ID) setUploadsBadge(0);
  }, [section]);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const runImport = async (entries: ImportEntry[]) => {
    if (!entries.length) return;
    setImporting({ done: 0, total: entries.length });
    const groups = await buildGroups(entries, (done, total) => setImporting({ done, total }));
    setImporting(null);
    const touched: string[] = [];
    let uploaded = 0;
    for (const g of groups) {
      const id = g.set ? `set_${setSlug(g.set)}` : UPLOADS_ID;
      const n = await appendToAvatarPack(id, g.set ?? t("Uploads"), g.items);
      if (n) touched.push(id);
      if (!g.set) uploaded += n;
    }
    if (uploaded && section !== UPLOADS_ID) setUploadsBadge((b) => b + uploaded);
    if (touched.length) {
      setFlashIds(touched);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashIds([]), 1400);
    }
  };

  const importImages = async () => {
    if (isNativePick()) await runImport(await pickImagesNative());
    else fileRef.current?.click();
  };
  const importFolder = async () => {
    if (isNativePick()) await runImport(await pickFolderNative());
    else folderRef.current?.click();
  };
  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (files?.length) void runImport(entriesFromFileList(files));
  };

  return {
    importing,
    flashIds,
    uploadsBadge,
    fileRef,
    folderRef,
    importImages,
    importFolder,
    onInputChange,
    runImport,
  };
}
