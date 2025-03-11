import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';
export const linkColumnType = propertyType('link');
export const linkPropertyModelConfig = linkColumnType.modelConfig({
  name: 'Link',
  valueSchema: zod.string().optional(),
  type: () => t.string.instance(),
  defaultData: () => ({}),
  cellToString: ({ value }) => value?.toString() ?? '',
  cellFromString: ({ value }) => {
    return {
      value: value,
    };
  },
  cellToJson: ({ value }) => value ?? null,
  cellFromJson: ({ value }) => (typeof value !== 'string' ? undefined : value),

  isEmpty: ({ value }) => value == null || value.length == 0,
});
