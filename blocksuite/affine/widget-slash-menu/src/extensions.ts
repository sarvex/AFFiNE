import {
  type BlockStdScope,
  StdIdentifier,
  WidgetViewExtension,
} from '@blocksuite/block-std';
import { type Container, createIdentifier } from '@blocksuite/global/di';
import { Extension, type ExtensionType } from '@blocksuite/store';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { defaultSlashMenuConfig } from './config';
import { AFFINE_SLASH_MENU_WIDGET } from './consts';
import type { SlashMenuConfig } from './types';
import { mergeSlashMenuConfigs } from './utils';

export class SlashMenuExtension extends Extension {
  config: SlashMenuConfig;

  static override setup(di: Container) {
    WidgetViewExtension(
      'affine:page',
      AFFINE_SLASH_MENU_WIDGET,
      literal`${unsafeStatic(AFFINE_SLASH_MENU_WIDGET)}`
    ).setup(di);

    di.add(this, [StdIdentifier]);

    // TODO(@L-Sun): remove this after moving all configs to corresponding extensions
    SlashMenuConfigExtension({
      id: 'default',
      config: defaultSlashMenuConfig,
    }).setup(di);
  }

  constructor(readonly std: BlockStdScope) {
    super();
    this.config = mergeSlashMenuConfigs(
      this.std.provider.getAll(SlashMenuConfigIdentifier)
    );
  }
}

const SlashMenuConfigIdentifier = createIdentifier<SlashMenuConfig>(
  `${AFFINE_SLASH_MENU_WIDGET}-config`
);

export function SlashMenuConfigExtension({
  id,
  config,
}: {
  id: string;
  config: SlashMenuConfig;
}): ExtensionType {
  return {
    setup: di => {
      di.addImpl(SlashMenuConfigIdentifier(id), config);
    },
  };
}
