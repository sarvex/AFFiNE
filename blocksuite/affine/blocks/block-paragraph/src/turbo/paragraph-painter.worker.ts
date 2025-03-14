import {
  type BlockLayout,
  type BlockLayoutPainter,
  BlockLayoutPainterExtension,
  type TextRect,
  type WorkerToHostMessage,
} from '@blocksuite/affine-gfx-turbo-renderer';

interface SentenceLayout {
  text: string;
  rects: TextRect[];
}

export interface ParagraphLayout extends BlockLayout {
  type: 'affine:paragraph';
  sentences: SentenceLayout[];
}

const meta = {
  emSize: 2048,
  hHeadAscent: 1984,
  hHeadDescent: -494,
};

const debugSentenceBorder = false;

function getBaseline() {
  const fontSize = 15;
  const lineHeight = 1.2 * fontSize;

  const A = fontSize * (meta.hHeadAscent / meta.emSize); // ascent
  const D = fontSize * (meta.hHeadDescent / meta.emSize); // descent
  const AD = A + Math.abs(D); // ascent + descent
  const L = lineHeight - AD; // leading
  const y = A + L / 2;
  return y;
}

function isParagraphLayout(layout: BlockLayout): layout is ParagraphLayout {
  return layout.type === 'affine:paragraph';
}

class ParagraphLayoutPainter implements BlockLayoutPainter {
  private static readonly supportFontFace =
    typeof FontFace !== 'undefined' &&
    typeof self !== 'undefined' &&
    'fonts' in self;

  static readonly font = ParagraphLayoutPainter.supportFontFace
    ? new FontFace(
        'Inter',
        `url(https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwYZ8UA3.woff2)`
      )
    : null;

  static fontLoaded = !ParagraphLayoutPainter.supportFontFace;

  static {
    if (ParagraphLayoutPainter.supportFontFace && ParagraphLayoutPainter.font) {
      // @ts-expect-error worker fonts API
      self.fonts.add(ParagraphLayoutPainter.font);

      ParagraphLayoutPainter.font
        .load()
        .then(() => {
          ParagraphLayoutPainter.fontLoaded = true;
        })
        .catch(error => {
          console.error('Failed to load Inter font:', error);
        });
    }
  }

  paint(
    ctx: OffscreenCanvasRenderingContext2D,
    layout: BlockLayout,
    layoutBaseX: number,
    layoutBaseY: number
  ): void {
    if (!ParagraphLayoutPainter.fontLoaded) {
      const message: WorkerToHostMessage = {
        type: 'paintError',
        error: 'Font not loaded',
        blockType: 'affine:paragraph',
      };
      self.postMessage(message);
      return;
    }

    if (!isParagraphLayout(layout)) return; // cast to ParagraphLayout

    const fontSize = 15;
    ctx.font = `300 ${fontSize}px Inter`;
    const baselineY = getBaseline();
    const renderedPositions = new Set<string>();

    layout.sentences.forEach(sentence => {
      ctx.strokeStyle = 'yellow';
      sentence.rects.forEach(textRect => {
        const x = textRect.rect.x - layoutBaseX;
        const y = textRect.rect.y - layoutBaseY;

        const posKey = `${x},${y}`;
        // Only render if we haven't rendered at this position before
        if (renderedPositions.has(posKey)) return;

        if (debugSentenceBorder) {
          ctx.strokeRect(x, y, textRect.rect.w, textRect.rect.h);
        }
        ctx.fillStyle = 'black';
        ctx.fillText(textRect.text, x, y + baselineY);

        renderedPositions.add(posKey);
      });
    });
  }
}

export const ParagraphLayoutPainterExtension = BlockLayoutPainterExtension(
  'affine:paragraph',
  ParagraphLayoutPainter
);
