/**
 * Öffentliche Schnittstelle des Moduls „Dokumente und Teilen".
 *
 * Andere Module binden ausschließlich das hier Exportierte ein:
 *
 *   import { QuickDocButton, ShareImageButton } from '../documents';
 *
 * Beispiele:
 *   // Katzenprofil: Stammbaum in einem Tipp
 *   <QuickDocButton catId={cat.id} kind="pedigree" block />
 *
 *   // Kittenprofil: Impfpass (auch wurfweit abgelegte werden gefunden)
 *   <QuickDocButton kittenId={k.id} litterId={k.litterId}
 *                   kind="vaccination_card" block />
 *
 *   // Kittenprofil: fertiges Bild für WhatsApp
 *   <ShareImageButton kittenId={k.id} block />
 */

export { DocumentsScreen } from './DocumentsScreen';
export { DocumentViewer, type DocumentViewerProps } from './DocumentViewer';
export { QuickDocButton, type QuickDocButtonProps } from './QuickDocButton';
export {
  DocumentEditorSheet,
  type DocumentEditorSheetProps,
  type DocumentLinks,
} from './DocumentEditorSheet';
export { ShareImageSheet, ShareImageButton, type ShareImageSheetProps } from './share/ShareImageSheet';
export { shareOrDownload, downloadBlob, canShareFiles, type ShareOutcome } from './share/shareFile';
export { renderShareCard, type RenderShareCardOptions, type RenderedCard } from './share/renderShareCard';
export {
  buildShareCardModel,
  buildGreeting,
  curveGeometry,
  type ShareCardModel,
  type CurveSample,
} from './share/shareCardLayout';
export { buildShareFileName, buildPageFileName, slugify } from './lib/filenames';
export { processImage, makeThumbnail, type ProcessedImage } from './imageProcessing';
export { useAttachmentUrl, useObjectUrl, useAttachmentPages } from './useObjectUrls';
