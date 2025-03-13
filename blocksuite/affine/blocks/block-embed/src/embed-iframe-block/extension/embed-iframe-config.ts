import {
  createIdentifier,
  type ServiceIdentifier,
} from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

/**
 * The options for the iframe
 * @example
 * {
 *   defaultWidth: '100%',
 *   defaultHeight: '152px',
 *   style: 'border-radius: 12px;',
 *   allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
 * }
 * <iframe
 *   width="100%"
 *   height="152px"
 *   style="border-radius: 12px;"
 *   allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
 * ></iframe>
 */
export type IframeOptions = {
  defaultWidth?: string;
  defaultHeight?: string;
  style?: string;
  referrerpolicy?: string;
  scrolling?: boolean;
  allow?: string;
  allowFullscreen?: boolean;
};

/**
 * Define the config of an embed iframe block
 * @example
 * {
 *   name: 'spotify',
 *   match: (url: string) => spotifyRegex.test(url),
 *   buildOEmbedUrl: (url: string) => {
 *     const match = url.match(spotifyRegex);
 *     if (!match) {
 *       return undefined;
 *     }
 *     const encodedUrl = encodeURIComponent(url);
 *     const oEmbedUrl = `${spotifyEndpoint}?url=${encodedUrl}`;
 *     return oEmbedUrl;
 *   },
 *   useOEmbedUrlDirectly: false,
 *   options: {
 *     defaultWidth: '100%',
 *     defaultHeight: '152px',
 *     allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
 *   }
 * }
 */
export type EmbedIframeConfig = {
  /**
   * The name of the embed iframe block
   */
  name: string;
  /**
   * The function to match the url
   */
  match: (url: string) => boolean;
  /**
   * The function to build the oEmbed URL for fetching embed data
   */
  buildOEmbedUrl: (url: string) => string | undefined;
  /**
   * Use oEmbed URL directly as iframe src without fetching oEmbed data
   */
  useOEmbedUrlDirectly: boolean;
  /**
   * The options for the iframe
   */
  options?: IframeOptions;
};

export const EmbedIframeConfigIdentifier =
  createIdentifier<EmbedIframeConfig>('EmbedIframeConfig');

export function EmbedIframeConfigExtension(
  config: EmbedIframeConfig
): ExtensionType & {
  identifier: ServiceIdentifier<EmbedIframeConfig>;
} {
  const identifier = EmbedIframeConfigIdentifier(config.name);
  return {
    setup: di => {
      di.addImpl(identifier, () => config);
    },
    identifier,
  };
}
