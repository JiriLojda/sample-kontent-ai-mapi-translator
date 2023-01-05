import { ElementModels } from '@kontent-ai/management-sdk';
import { NormalizedContentTypeElementType } from './loadContentType';

export const createTranslationKey = (elementId: string, itemId: string, elementType: ElementModels.ElementType, restParts: ReadonlyArray<string>) =>
  `${itemId};${elementId};${elementType}${restParts.length ? ';' : ''}${restParts.join(';')}`;

export const parseTranslationKey = (key: string) => {
  const [itemId, elementId, elementType, ...restParts] = key.split(';');
  if (!itemId || !elementId || !elementType || !isElementType(elementType)) {
    return null;
  }
  return { itemId, elementId, elementType, restParts };
};



const allElementTypes = Object.keys<keyof Record<NormalizedContentTypeElementType, null>>({
  asset: null,
  custom: null,
  number: null,
  date_time: null,
  guidelines: null,
  modular_content: null,
  multiple_choice: null,
  rich_text: null,
  text: null,
  subpages: null,
  taxonomy: null,
  url_slug: null,
});

const isElementType = (elementType: string): elementType is NormalizedContentTypeElementType =>
  (allElementTypes as string[]).includes(elementType);
