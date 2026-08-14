import { useEffect, useRef, useState } from "react";
import { fetchProfileAlias, isPlaceholderName, nameEquals, pushNameToProfileAlias } from "@/lib/account/name-sync";
import { useProfiles } from "@/lib/profiles";
import { currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import { useTogether } from "@/lib/together/provider";

type SyncState = { id: string | null; ready: boolean; alias: string | null };

export function HarborNameSync() {
  const [author, setAuthor] = useState(currentAuthor);
  const { displayName, setDisplayName } = useTogether();
  const { activeProfile, updateProfile } = useProfiles();
  const state = useRef<SyncState>({ id: null, ready: false, alias: null });

  useEffect(() => subscribeAuthor(() => setAuthor(currentAuthor())), []);

  useEffect(() => {
    if (!author?.handle) {
      state.current = { id: null, ready: false, alias: null };
      return;
    }
    if (state.current.id === author.id) return;
    state.current = { id: author.id, ready: false, alias: null };
    const authorId = author.id;
    const localAtStart = (displayName ?? "").trim();
    let cancelled = false;
    void fetchProfileAlias(author.handle).then((alias) => {
      if (cancelled || state.current.id !== authorId) return;
      if (alias && !isPlaceholderName(alias)) {
        state.current.alias = alias;
        if (!nameEquals(alias, displayName)) setDisplayName(alias);
        if (activeProfile && !activeProfile.kid && !nameEquals(alias, activeProfile.name)) {
          updateProfile(activeProfile.id, { name: alias });
        }
      } else if (!isPlaceholderName(localAtStart)) {
        state.current.alias = localAtStart;
        void pushNameToProfileAlias(localAtStart);
      }
      state.current.ready = true;
    });
    return () => {
      cancelled = true;
    };
  }, [author?.id, author?.handle, displayName, activeProfile, setDisplayName, updateProfile]);

  useEffect(() => {
    if (!author?.handle) return;
    const st = state.current;
    if (st.id !== author.id || !st.ready) return;
    const name = (displayName ?? "").trim();
    if (!name || isPlaceholderName(name)) return;
    if (st.alias !== null && nameEquals(st.alias, name)) return;
    st.alias = name;
    void pushNameToProfileAlias(name);
  }, [displayName, author?.id, author?.handle]);

  return null;
}
