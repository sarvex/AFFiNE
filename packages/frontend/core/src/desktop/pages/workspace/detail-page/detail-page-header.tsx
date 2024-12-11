import {
  Divider,
  DragHandle,
  type InlineEditHandle,
  observeResize,
  useDraggable,
} from '@affine/component';
import { SharePageButton } from '@affine/core/components/affine/share-page-modal';
import { FavoriteButton } from '@affine/core/components/blocksuite/block-suite-header/favorite';
import { InfoButton } from '@affine/core/components/blocksuite/block-suite-header/info';
import { JournalWeekDatePicker } from '@affine/core/components/blocksuite/block-suite-header/journal/date-picker';
import { JournalTodayButton } from '@affine/core/components/blocksuite/block-suite-header/journal/today-button';
import { PageHeaderMenuButton } from '@affine/core/components/blocksuite/block-suite-header/menu';
import { DetailPageHeaderPresentButton } from '@affine/core/components/blocksuite/block-suite-header/present/detail-header-present-button';
import { BlocksuiteHeaderTitle } from '@affine/core/components/blocksuite/block-suite-header/title';
import { EditorModeSwitch } from '@affine/core/components/blocksuite/block-suite-mode-switch';
import { useRegisterCopyLinkCommands } from '@affine/core/components/hooks/affine/use-register-copy-link-commands';
import { HeaderDivider } from '@affine/core/components/pure/header';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { EditorService } from '@affine/core/modules/editor';
import { JournalService } from '@affine/core/modules/journal';
import { ViewIcon, ViewTitle } from '@affine/core/modules/workbench';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import type { Doc } from '@blocksuite/affine/store';
import { useLiveData, useService, type Workspace } from '@toeverything/infra';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import * as styles from './detail-page-header.css';
import { useDetailPageHeaderResponsive } from './use-header-responsive';

const Header = forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }
>(({ children, style, className }, ref) => {
  return (
    <div data-testid="header" style={style} className={className} ref={ref}>
      {children}
    </div>
  );
});

Header.displayName = 'forwardRef(Header)';

interface PageHeaderProps {
  page: Doc;
  workspace: Workspace;
}
export function JournalPageHeader({ page, workspace }: PageHeaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return observeResize(container, entry => {
      setContainerWidth(entry.contentRect.width);
    });
  }, []);

  const { hideShare, hideToday } =
    useDetailPageHeaderResponsive(containerWidth);

  const docDisplayMetaService = useService(DocDisplayMetaService);
  const i18n = useI18n();
  const title = i18n.t(useLiveData(docDisplayMetaService.title$(page.id)));

  return (
    <Header className={styles.header} ref={containerRef}>
      <ViewTitle title={title} />
      <ViewIcon icon="journal" />
      <EditorModeSwitch />
      <div className={styles.journalWeekPicker}>
        <JournalWeekDatePicker page={page} />
      </div>
      {hideToday ? null : <JournalTodayButton />}
      <HeaderDivider />
      <PageHeaderMenuButton
        isJournal
        page={page}
        containerWidth={containerWidth}
      />
      {page && !hideShare ? (
        <SharePageButton workspace={workspace} page={page} />
      ) : null}
    </Header>
  );
}

export function NormalPageHeader({ page, workspace }: PageHeaderProps) {
  const titleInputHandleRef = useRef<InlineEditHandle>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return observeResize(container, entry => {
      setContainerWidth(entry.contentRect.width);
    });
  }, []);

  const { hideCollect, hideShare, hidePresent, showDivider } =
    useDetailPageHeaderResponsive(containerWidth);

  const onRename = useCallback(() => {
    setTimeout(
      () => titleInputHandleRef.current?.triggerEdit(),
      500 /* wait for menu animation end */
    );
  }, []);

  const docDisplayMetaService = useService(DocDisplayMetaService);
  const i18n = useI18n();
  const title = i18n.t(useLiveData(docDisplayMetaService.title$(page.id)));

  const editor = useService(EditorService).editor;
  const currentMode = useLiveData(editor.mode$);

  return (
    <Header className={styles.header} ref={containerRef}>
      <ViewTitle title={title} />
      <ViewIcon icon={currentMode ?? 'page'} />
      <EditorModeSwitch />
      <BlocksuiteHeaderTitle
        docId={page.id}
        inputHandleRef={titleInputHandleRef}
      />
      <div className={styles.iconButtonContainer}>
        {hideCollect ? null : (
          <>
            <FavoriteButton pageId={page?.id} />
            <InfoButton docId={page.id} />
          </>
        )}
        <PageHeaderMenuButton
          rename={onRename}
          page={page}
          containerWidth={containerWidth}
        />
      </div>

      <div className={styles.spacer} />

      {!hidePresent ? <DetailPageHeaderPresentButton /> : null}

      {page && !hideShare ? (
        <SharePageButton workspace={workspace} page={page} />
      ) : null}

      {showDivider ? (
        <Divider orientation="vertical" style={{ height: 20, marginLeft: 4 }} />
      ) : null}
    </Header>
  );
}

export function DetailPageHeader(
  props: PageHeaderProps & {
    onDragging?: (dragging: boolean) => void;
  }
) {
  const { page, workspace, onDragging } = props;
  const journalService = useService(JournalService);
  const isJournal = !!useLiveData(journalService.journalDate$(page.id));
  const isInTrash = page.meta?.trash;

  useRegisterCopyLinkCommands({
    workspaceMeta: workspace.meta,
    docId: page.id,
  });

  const { dragRef, dragging, CustomDragPreview } =
    useDraggable<AffineDNDData>(() => {
      return {
        data: {
          from: {
            at: 'doc-detail:header',
            docId: page.id,
          },
          entity: {
            type: 'doc',
            id: page.id,
          },
        },
        dragPreviewPosition: 'pointer-outside',
      };
    }, [page.id]);

  const inner =
    isJournal && !isInTrash ? (
      <JournalPageHeader {...props} />
    ) : (
      <NormalPageHeader {...props} />
    );

  useEffect(() => {
    onDragging?.(dragging);
  }, [dragging, onDragging]);

  return (
    <>
      <div className={styles.root} ref={dragRef} data-dragging={dragging}>
        <DragHandle dragging={dragging} className={styles.dragHandle} />
        {inner}
      </div>
      <CustomDragPreview>
        <div className={styles.dragPreview}>{inner}</div>
      </CustomDragPreview>
    </>
  );
}
