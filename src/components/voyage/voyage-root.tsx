import { useVoyageOpen } from "@/lib/voyage/store";
import { VoyageModal } from "./voyage-modal";

export function VoyageRoot() {
  const open = useVoyageOpen();
  return open ? <VoyageModal /> : null;
}
