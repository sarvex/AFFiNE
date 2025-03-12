import { ChatHistoryOrder } from '@affine/graphql';
import {
  BlockSelection,
  type BlockStdScope,
  type EditorHost,
  TextSelection,
} from '@blocksuite/affine/block-std';
import { GfxControllerIdentifier } from '@blocksuite/affine/block-std/gfx';
import { EdgelessCRUDIdentifier } from '@blocksuite/affine/blocks/surface';
import {
  Bound,
  getCommonBoundWithRotation,
  type SerializedXYWH,
} from '@blocksuite/affine/global/gfx';
import {
  type DocMode,
  NoteDisplayMode,
  ParagraphBlockModel,
} from '@blocksuite/affine/model';
import { RefNodeSlotsProvider } from '@blocksuite/affine/rich-text';
import { getSelectedBlocksCommand } from '@blocksuite/affine/shared/commands';
import type { ImageSelection } from '@blocksuite/affine/shared/selection';
import {
  DocModeProvider,
  EditPropsStore,
  NotificationProvider,
  TelemetryProvider,
} from '@blocksuite/affine/shared/services';
import { matchModels } from '@blocksuite/affine/shared/utils';
import type { Store } from '@blocksuite/affine/store';
import {
  BlockIcon,
  InsertBleowIcon as InsertBelowIcon,
  LinkedPageIcon,
  PageIcon,
  ReplaceIcon,
} from '@blocksuite/icons/lit';
import type { TemplateResult } from 'lit';

import { insertFromMarkdown } from '../../utils';
import type { ChatMessage } from '../blocks';
import { AIProvider, type AIUserInfo } from '../provider';
import { reportResponse } from '../utils/action-reporter';
import { insertBelow, replace } from '../utils/editor-actions';

type Selections = {
  text?: TextSelection;
  blocks?: BlockSelection[];
  images?: ImageSelection[];
};

export type ChatAction = {
  icon: TemplateResult<1>;
  title: string;
  toast: string;
  showWhen: (host: EditorHost) => boolean;
  handler: (
    host: EditorHost,
    content: string,
    currentSelections: Selections,
    chatSessionId?: string,
    messageId?: string
  ) => Promise<boolean>;
};

export async function queryHistoryMessages(
  workspaceId: string,
  docId: string,
  forkSessionId: string
) {
  // Get fork session messages
  const histories = await AIProvider.histories?.chats(workspaceId, docId, {
    sessionId: forkSessionId,
    messageOrder: ChatHistoryOrder.asc,
  });

  if (!histories || !histories.length) {
    return [];
  }

  return histories[0].messages;
}

// Construct user info with messages
export function constructUserInfoWithMessages(
  messages: ChatMessage[],
  userInfo: AIUserInfo | null
) {
  return messages.map(message => {
    const { role, id, content, createdAt } = message;
    const isUser = role === 'user';
    const userInfoProps = isUser
      ? {
          userId: userInfo?.id,
          userName: userInfo?.name,
          avatarUrl: userInfo?.avatarUrl ?? undefined,
        }
      : {};
    return {
      id,
      role,
      content,
      createdAt,
      attachments: [],
      ...userInfoProps,
    };
  });
}

export async function constructRootChatBlockMessages(
  doc: Store,
  forkSessionId: string
) {
  // Convert chat messages to AI chat block messages
  const userInfo = await AIProvider.userInfo;
  const forkMessages = await queryHistoryMessages(
    doc.workspace.id,
    doc.id,
    forkSessionId
  );
  return constructUserInfoWithMessages(forkMessages, userInfo);
}

function getViewportCenter(mode: DocMode, std: BlockStdScope) {
  const center = { x: 400, y: 50 };
  if (mode === 'page') {
    const viewport = std.get(EditPropsStore).getStorage('viewport');
    if (viewport) {
      if ('xywh' in viewport) {
        const bound = Bound.deserialize(viewport.xywh);
        center.x = bound.x + bound.w / 2;
        center.y = bound.y + bound.h / 2;
      } else {
        center.x = viewport.centerX;
        center.y = viewport.centerY;
      }
    }
  } else {
    // Else we should get latest viewport center from the edgeless root service
    const viewport = std.get(GfxControllerIdentifier).viewport;
    center.x = viewport.centerX;
    center.y = viewport.centerY;
  }

  return center;
}

// Add AI chat block and focus on it
function addAIChatBlock(
  host: EditorHost,
  messages: ChatMessage[],
  sessionId: string,
  viewportCenter: { x: number; y: number },
  index: string
) {
  if (!messages.length || !sessionId) {
    return;
  }

  const { doc } = host;
  const surfaceBlock = doc
    .getStore()
    .find(block => block.flavour === 'affine:surface');
  if (!surfaceBlock) {
    return;
  }

  // Add AI chat block to the center of the viewport
  const width = 300; // AI_CHAT_BLOCK_WIDTH = 300
  const height = 320; // AI_CHAT_BLOCK_HEIGHT = 320
  const x = viewportCenter.x - width / 2;
  const y = viewportCenter.y - height / 2;
  const bound = new Bound(x, y, width, height);
  const aiChatBlockId = doc.addBlock(
    'affine:embed-ai-chat',
    {
      xywh: bound.serialize(),
      messages: JSON.stringify(messages),
      index,
      sessionId,
      rootWorkspaceId: doc.workspace.id,
      rootDocId: doc.id,
    },
    surfaceBlock.id
  );

  return aiChatBlockId;
}

export function promptDocTitle(host: EditorHost, autofill?: string) {
  const notification = host.std.getOptional(NotificationProvider);
  if (!notification) return Promise.resolve(undefined);

  return notification.prompt({
    title: 'Create linked doc',
    message: 'Enter a title for the new doc.',
    placeholder: 'Untitled',
    autofill,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
  });
}

const REPLACE_SELECTION = {
  icon: ReplaceIcon({ width: '20px', height: '20px' }),
  title: 'Replace selection',
  showWhen: (host: EditorHost) => {
    if (host.std.store.readonly$.value) {
      return false;
    }
    const textSelection = host.selection.find(TextSelection);
    const blockSelections = host.selection.filter(BlockSelection);
    if (
      (!textSelection || textSelection.from.length === 0) &&
      blockSelections?.length === 0
    ) {
      return false;
    }
    return true;
  },
  toast: 'Successfully replaced',
  handler: async (
    host: EditorHost,
    content: string,
    currentSelections: Selections
  ) => {
    const currentTextSelection = currentSelections.text;
    const currentBlockSelections = currentSelections.blocks;
    const [_, data] = host.command.exec(getSelectedBlocksCommand, {
      currentTextSelection,
      currentBlockSelections,
    });
    if (!data.selectedBlocks) return false;

    reportResponse('result:replace');

    if (currentTextSelection) {
      const { doc } = host;
      const block = doc.getBlock(currentTextSelection.blockId);
      if (matchModels(block?.model ?? null, [ParagraphBlockModel])) {
        block?.model.text?.replace(
          currentTextSelection.from.index,
          currentTextSelection.from.length,
          content
        );
        return true;
      }
    }

    await replace(
      host,
      content,
      data.selectedBlocks[0],
      data.selectedBlocks.map(block => block.model),
      currentTextSelection
    );
    return true;
  },
};

const INSERT_BELOW = {
  icon: InsertBelowIcon({ width: '20px', height: '20px' }),
  title: 'Insert below',
  showWhen: (host: EditorHost) => {
    if (host.std.store.readonly$.value) {
      return false;
    }
    return true;
  },
  toast: 'Successfully inserted',
  handler: async (
    host: EditorHost,
    content: string,
    currentSelections: Selections
  ) => {
    const currentTextSelection = currentSelections.text;
    const currentBlockSelections = currentSelections.blocks;
    const currentImageSelections = currentSelections.images;
    const [_, data] = host.command.exec(getSelectedBlocksCommand, {
      currentTextSelection,
      currentBlockSelections,
      currentImageSelections,
    });
    if (!data.selectedBlocks) return false;
    reportResponse('result:insert');
    await insertBelow(
      host,
      content,
      data.selectedBlocks[data.selectedBlocks?.length - 1]
    );
    return true;
  },
};

const SAVE_CHAT_TO_BLOCK_ACTION: ChatAction = {
  icon: BlockIcon({ width: '20px', height: '20px' }),
  title: 'Save chat to block',
  toast: 'Successfully saved chat to a block',
  showWhen: (host: EditorHost) => {
    if (host.std.store.readonly$.value) {
      return false;
    }
    return true;
  },
  handler: async (
    host: EditorHost,
    _,
    __,
    chatSessionId?: string,
    messageId?: string
  ) => {
    // The chat session id and the latest message id are required to fork the chat session
    const parentSessionId = chatSessionId;
    if (!messageId || !parentSessionId) {
      return false;
    }

    const notificationService = host.std.getOptional(NotificationProvider);
    const docModeService = host.std.get(DocModeProvider);
    const layer = host.std.get(GfxControllerIdentifier).layer;
    const curMode = docModeService.getEditorMode() || 'page';
    const viewportCenter = getViewportCenter(curMode, host.std);
    const newBlockIndex = layer.generateIndex();
    // If current mode is not edgeless, switch to edgeless mode first
    if (curMode !== 'edgeless') {
      // Set mode to edgeless
      docModeService.setEditorMode('edgeless' as DocMode);
      // Notify user to switch to edgeless mode
      notificationService?.notify({
        title: 'Save chat to a block',
        accent: 'info',
        message:
          'This feature is not available in the page editor. Switch to edgeless mode.',
        onClose: function (): void {},
      });
    }

    try {
      const newSessionId = await AIProvider.forkChat?.({
        workspaceId: host.doc.workspace.id,
        docId: host.doc.id,
        sessionId: parentSessionId,
        latestMessageId: messageId,
      });

      if (!newSessionId) {
        return false;
      }

      // Get messages before the latest message
      const messages = await constructRootChatBlockMessages(
        host.doc,
        newSessionId
      );

      // After switching to edgeless mode, the user can save the chat to a block
      const blockId = addAIChatBlock(
        host,
        messages,
        newSessionId,
        viewportCenter,
        newBlockIndex
      );
      if (!blockId) {
        return false;
      }

      const telemetryService = host.std.getOptional(TelemetryProvider);
      telemetryService?.track('CanvasElementAdded', {
        control: 'manually save',
        page: 'whiteboard editor',
        module: 'ai chat panel',
        segment: 'right sidebar',
        type: 'chat block',
        category: 'root',
      });
      return true;
    } catch (err) {
      console.error(err);
      notificationService?.notify({
        title: 'Failed to save chat to a block',
        accent: 'error',
        onClose: function (): void {},
      });
      return false;
    }
  },
};

const ADD_TO_EDGELESS_AS_NOTE = {
  icon: PageIcon({ width: '20px', height: '20px' }),
  title: 'Add to edgeless as note',
  showWhen: (host: EditorHost) => {
    if (host.std.store.readonly$.value) {
      return false;
    }
    return true;
  },
  toast: 'New note created',
  handler: async (host: EditorHost, content: string) => {
    reportResponse('result:add-note');
    const { doc } = host;

    const gfx = host.std.get(GfxControllerIdentifier);
    const elements = gfx.selection.selectedElements;
    const props: { displayMode: NoteDisplayMode; xywh?: SerializedXYWH } = {
      displayMode: NoteDisplayMode.EdgelessOnly,
    };

    if (elements.length > 0) {
      const bound = getCommonBoundWithRotation(
        elements.map(e => Bound.deserialize(e.xywh))
      );
      const newBound = new Bound(bound.x, bound.maxY + 10, bound.w);
      props.xywh = newBound.serialize();
    }

    const id = doc.addBlock('affine:note', props, doc.root?.id);

    await insertFromMarkdown(host, content, doc, id, 0);

    gfx.selection.set({
      elements: [id],
      editing: false,
    });

    return true;
  },
};

const CREATE_AS_DOC = {
  icon: PageIcon({ width: '20px', height: '20px' }),
  title: 'Create as a doc',
  showWhen: () => true,
  toast: 'New doc created',
  handler: (host: EditorHost, content: string) => {
    reportResponse('result:add-page');
    const newDoc = host.doc.workspace.createDoc();
    newDoc.load();
    const rootId = newDoc.addBlock('affine:page');
    newDoc.addBlock('affine:surface', {}, rootId);
    const noteId = newDoc.addBlock('affine:note', {}, rootId);

    host.std.getOptional(RefNodeSlotsProvider)?.docLinkClicked.next({
      pageId: newDoc.id,
      host,
    });
    let complete = false;
    (function addContent() {
      if (complete) return;
      const newHost = document.querySelector('editor-host');
      // FIXME: this is a hack to wait for the host to be ready, now we don't have a way to know if the new host is ready
      if (!newHost || newHost === host) {
        setTimeout(addContent, 100);
        return;
      }
      complete = true;
      const { doc } = newHost;
      insertFromMarkdown(newHost, content, doc, noteId, 0).catch(console.error);
    })();

    return true;
  },
};

const CREATE_AS_LINKED_DOC = {
  icon: LinkedPageIcon({ width: '20px', height: '20px' }),
  title: 'Create as a linked doc',
  showWhen: (host: EditorHost) => {
    if (host.std.store.readonly$.value) {
      return false;
    }
    return true;
  },
  toast: 'New doc created',
  handler: async (host: EditorHost, content: string) => {
    reportResponse('result:add-page');

    const { doc } = host;
    const surfaceBlock = doc
      .getStore()
      .find(block => block.flavour === 'affine:surface');
    if (!surfaceBlock) {
      return false;
    }

    const docModeService = host.std.get(DocModeProvider);
    const mode = docModeService.getEditorMode();
    if (mode !== 'edgeless') {
      return false;
    }

    // Create a new doc and add the content to it
    const newDoc = host.doc.workspace.createDoc();
    newDoc.load();
    const rootId = newDoc.addBlock('affine:page');
    newDoc.addBlock('affine:surface', {}, rootId);
    const noteId = newDoc.addBlock('affine:note', {}, rootId);
    await insertFromMarkdown(host, content, newDoc, noteId, 0);

    const gfx = host.std.get(GfxControllerIdentifier);
    // Add a linked doc card to link to the new doc
    const elements = gfx.selection.selectedElements;
    const width = 364;
    const height = 390;
    let x = 0;
    let y = 0;
    if (elements.length) {
      // Calculate the bound of the selected elements first
      const bound = getCommonBoundWithRotation(
        elements.map(e => Bound.deserialize(e.xywh))
      );
      x = bound.x;
      y = bound.y + bound.h + 100;
    }

    // If the selected elements are not in the viewport, center the linked doc card
    if (x === Number.POSITIVE_INFINITY || y === Number.POSITIVE_INFINITY) {
      const viewportCenter = getViewportCenter(mode, host.std);
      x = viewportCenter.x - width / 2;
      y = viewportCenter.y - height / 2;
    }

    host.std.get(EdgelessCRUDIdentifier).addBlock(
      'affine:embed-linked-doc',
      {
        xywh: `[${x}, ${y}, ${width}, ${height}]`,
        style: 'vertical',
        pageId: newDoc.id,
      },
      surfaceBlock.id
    );

    return true;
  },
};

const CommonActions: ChatAction[] = [REPLACE_SELECTION, INSERT_BELOW];

export const PageEditorActions = [
  ...CommonActions,
  CREATE_AS_DOC,
  SAVE_CHAT_TO_BLOCK_ACTION,
];

export const EdgelessEditorActions = [
  ...CommonActions,
  ADD_TO_EDGELESS_AS_NOTE,
  SAVE_CHAT_TO_BLOCK_ACTION,
];

export const ChatBlockPeekViewActions = [
  ADD_TO_EDGELESS_AS_NOTE,
  CREATE_AS_LINKED_DOC,
];
