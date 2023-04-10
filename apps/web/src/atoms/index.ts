import { atomWithSyncStorage } from '@affine/jotai';
import { jotaiWorkspacesAtom } from '@affine/workspace/atom';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { atom } from 'jotai';
import { atomFamily, selectAtom } from 'jotai/utils';

import { WorkspacePlugins } from '../plugins';
import type { AllWorkspace } from '../shared';
// workspace necessary atoms
export const currentWorkspaceIdAtom = atom<string | null>(null);
export const currentPageIdAtom = atom<string | null>(null);
export const currentEditorAtom = atom<Readonly<EditorContainer> | null>(null);

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom(false);
export const openQuickSearchModalAtom = atom(false);

const workspaceFlavourSelector = (id: string) =>
  selectAtom(
    jotaiWorkspacesAtom,
    workspaces => workspaces.find(workspace => workspace.id === id)?.flavour
  );

// id -> flavour (atom)
const workspaceFlavourAtom = atomFamily((id: string) => {
  return atom(get => {
    const flavour = get(workspaceFlavourSelector(id));
    return flavour;
  });
});

export const workspaceByIdAtomFamily = atomFamily((id?: string | null) => {
  return atom(async get => {
    if (!id) return null;
    const flavour = get(workspaceFlavourAtom(id));
    if (!flavour) return null;
    const plugin = WorkspacePlugins[flavour];
    assertExists(plugin);
    const { CRUD } = plugin;
    return CRUD.get(id) as Promise<AllWorkspace>;
  });
});

type View = { id: string; mode: 'page' | 'edgeless' };

export type WorkspaceRecentViews = Record<string, View[]>;

export const workspaceRecentViewsAtom =
  atomWithSyncStorage<WorkspaceRecentViews>('recentViews', {});

export type PreferredModeRecord = Record<Page['id'], 'page' | 'edgeless'>;
export const workspacePreferredModeAtom =
  atomWithSyncStorage<PreferredModeRecord>('preferredMode', {});

export const workspaceRecentViresWriteAtom = atom<null, [string, View], View[]>(
  null,
  (get, set, id, value) => {
    const record = get(workspaceRecentViewsAtom);
    if (Array.isArray(record[id])) {
      const idx = record[id].findIndex(view => view.id === value.id);
      if (idx !== -1) {
        record[id].splice(idx, 1);
      }
      record[id] = [value, ...record[id]];
    } else {
      record[id] = [value];
    }

    record[id] = record[id].slice(0, 3);
    set(workspaceRecentViewsAtom, { ...record });
    return record[id];
  }
);
