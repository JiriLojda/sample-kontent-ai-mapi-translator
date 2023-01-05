import { Handler } from '@netlify/functions';
import { LanguageModels, ManagementClient } from '@kontent-ai/management-sdk';
import { parseTranslationKey } from './initTranslation/translationKey';
import { loadContentTypes } from './initTranslation/loadContentType';
import { prepareDataForTranslation } from './initTranslation/prepareElementForTranslation';
import { convertTranslatedElement } from './initTranslation/convertElementFromTranslation';
import { collectLinkedItemsToTranslate } from './initTranslation/collectLinkedItemsToTranslate';

type Data = Readonly<Record<string, string>>;

export const handler: Handler = async (event) => {
  if (event.httpMethod.toLowerCase() !== 'post') {
    return {
      statusCode: 400,
      body: 'Unsupported method.',
    };
  }
  const body: Body = JSON.parse(event.body || '');

  const client = new ManagementClient({
    projectId: body.projectId,
    apiKey: body.mapiKey,
  });

  const contentTypes = await loadContentTypes(client);
  const typesById = new Map(contentTypes.map(type => [type.id, type] as const));
  const variantsWithLinkedItems = await collectLinkedItemsToTranslate(client, body.itemIds, body.fromLanguageId, typesById);
  const variantsToTranslate = [...variantsWithLinkedItems.values()].map(([variant, { typeId }]) => ({ variant, typeId }));

  const data = variantsToTranslate
    .map(({ variant, typeId }) => {
      const type = typesById.get(typeId);
      if (!type) {
        throw new Error(`Failed to find appropriate type for variant of item ${variant.item.id}}`);
      }
      return {
        itemId: variant.item.id || '',
        data: prepareDataForTranslation(variant, type),
      };
    });

  const targetLanguages = await client.listLanguages().toAllPromise().then(languages => languages.data.items.filter(l => body.toLanguageIds.includes(l.id)));

  const translatedData = await Promise.all(data.map(d => sendToTsm(d.data, targetLanguages).then(translations => ({
    itemId: d.itemId,
    translations,
  }))));

  const results = await Promise.all(
    translatedData
      .map(({ itemId, translations }) =>
        Promise.all(Object.entries(translations)
          .map(([languageId, d]) => upsertTranslatedData(languageId, variantsWithLinkedItems.get(itemId)?.[2] ?? new Map(), { itemId, translations: d }, client)))),
  );

  return {
    statusCode: 200,
    body: `Written variants: ${results.map(r => r.map(v => `${v.data.item.id}/${v.data.language.id}`).join(',')).join('\n')}`,
  }
};

const upsertTranslatedData = (languageId: string, linkedItemsByElementId: ReadonlyMap<string, ReadonlyArray<string>>, {
  itemId,
  translations,
}: Readonly<{ itemId: string; translations: Data }>, client: ManagementClient) => {
  const elements = Object.entries(translations)
    .map(([key, value]) => {
      const parsedKey = parseTranslationKey(key);
      if (!parsedKey) {
        throw new Error(`Invalid key from translations '${key}'.`);
      }
      return {
        ...parsedKey,
        value: value as string | readonly string[],
      };
    })
    .concat(...[...linkedItemsByElementId.entries()].map(([elementId, value]) => ({ itemId, elementId, elementType: 'modular_content' as const, restParts: [], value })));

  return client
    .upsertLanguageVariant()
    .byItemId(itemId)
    .byLanguageId(languageId)
    .withData(builder => elements.map(el => convertTranslatedElement(el.value, el.restParts, el.elementId, el.elementType, builder)))
    .toPromise();
};

const sendToTsm = (texts: Data, targetLanguages: ReadonlyArray<LanguageModels.LanguageModel>) => {
  console.log('please TSM translate the following into ', targetLanguages.map(l => l.codename).join(''));
  console.log('data to translate: ', texts);

  const translated = Object.fromEntries(Object.keys(texts).map(key => [key, 'Translated'] as const));
  return Promise.resolve(Object.fromEntries(targetLanguages.map(l => [l.id, translated] as const)));
};

type Body = Readonly<{
  projectId: string;
  mapiKey: string;
  itemIds: ReadonlyArray<string>;
  fromLanguageId: string;
  toLanguageIds: ReadonlyArray<string>;
}>;
