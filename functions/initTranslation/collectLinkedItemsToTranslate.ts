import { LanguageVariantModels, ManagementClient } from '@kontent-ai/management-sdk';
import { NormalizedContentType } from './loadContentType';

type ItemIdsByElementId = ReadonlyMap<string, ReadonlyArray<string>>;

export const collectLinkedItemsToTranslate = (
  client: ManagementClient,
  itemIds: ReadonlyArray<string>,
  languageId: string,
  allTypesById: ReadonlyMap<string, NormalizedContentType>,
  alreadyFoundIds: ReadonlySet<string> = new Set(),
): Promise<ReadonlyMap<string, readonly [LanguageVariantModels.ContentItemLanguageVariant, { readonly typeId: string }, ItemIdsByElementId]>> => {
  const firstItemId = itemIds[0];
  if (!firstItemId || alreadyFoundIds.has(firstItemId)) {
    return Promise.resolve(new Map());
  }
  return collectLinkedItemsToTranslateForItem(client, firstItemId, languageId, allTypesById, alreadyFoundIds)
    .then(foundItems => {
      const newFound = new Set([...alreadyFoundIds, ...foundItems.keys()]);

      return collectLinkedItemsToTranslate(client, itemIds.slice(1), languageId, allTypesById, newFound)
        .then(moreFound => new Map([...foundItems.entries(), ...moreFound.entries()]));
    });
}

const collectLinkedItemsToTranslateForItem = (
  client: ManagementClient,
  itemId: string,
  languageId: string,
  allTypesById: ReadonlyMap<string, NormalizedContentType>,
  alreadyFoundIds: ReadonlySet<string>,
): Promise<ReadonlyMap<string, readonly [LanguageVariantModels.ContentItemLanguageVariant, { readonly typeId: string }, ItemIdsByElementId]>> =>
  loadItemVariantWithTypeId(client, languageId, itemId)
    .then(([typeId, variant]) => {
      const type = allTypesById.get(typeId);
      if (!type) {
        throw new Error(`Failed to find content type with id ${typeId} for variant ${itemId}/${languageId}.`);
      }
      return [variant, typeId, extractLinkedItemIds(variant, type)] as const;
    })
    .then(([variant, typeId, linkedItemsPerElementId]) => {
      const itemIdsToFetch = [...new Set([...linkedItemsPerElementId.values()].flat())];
      return collectLinkedItemsToTranslate(client, itemIdsToFetch, languageId, allTypesById, new Set([...alreadyFoundIds, itemId]))
        .then(res => new Map([[itemId, [variant, { typeId }, linkedItemsPerElementId]], ...res.entries()]));
    });

const extractLinkedItemIds = (itemVariant: LanguageVariantModels.ContentItemLanguageVariant, type: NormalizedContentType): ReadonlyMap<string, ReadonlyArray<string>> =>
  new Map(itemVariant.elements
  .map(el => {
    const typeEl = type.elements.find(e => e.id === el.element.id);
    return typeEl?.type === 'modular_content' && Array.isArray(el.value)
      ? [el.element.id || '', el.value.map(ref => ref.id || '')] as const
      : null;
  })
  .filter(notNull));

const loadItemVariantWithTypeId = (client: ManagementClient, languageId: string, itemId: string) =>
  client
    .viewLanguageVariant()
    .byItemId(itemId)
    .byLanguageId(languageId)
    .toPromise()
    .then(res => res.data)
    .then(variant => client
      .viewContentItem()
      .byItemId(variant.item.id || '')
      .toPromise()
      .then(res => [res.data.type.id, variant] as const));

const notNull = <T>(v: T | null): v is T => v !== null;

type NativeNode = { readonly tagName: string; }; // ... more data of native nodes

type LinkedItem = { readonly itemId: string; readonly itemName: string }; // no idea what info is in the html
type Asset = { readonly assetId: string }; // and anything else for assets
//...
type CustomNode = LinkedItem | Asset;

type IncludeIfUndefined<ToInclude, Condition> = Condition extends undefined ? ToInclude : never;
type OptionalReturnType<T extends ((...args: readonly any[]) => any) | undefined> = T extends AnyFunction ? ReturnType<T> : never;
type AnyFunction = (...args: readonly any[]) => any;

type Tree<NodeValue> = Readonly<{ value: NodeValue; children: ReadonlyArray<Tree<NodeValue>> }>;
type AnyResolvers = Readonly<{
  assets?: (node: Asset) => unknown;
  linkedItems?: (node: LinkedItem) => unknown;
  nativeNode?: (node: NativeNode) => unknown;
}>;
type EvaluateResolverResult<Resolver extends AnyFunction | undefined, Fallback> = Resolver extends (...args: ReadonlyArray<any>) => infer Res ? Res : Fallback;

type Resolver = <Resolvers extends AnyResolvers>(richText: string, resolvers: Resolvers) => Tree<EvaluateResolverResult<Resolvers['nativeNode'], NativeNode> | EvaluateResolverResult<Resolvers['assets'], Asset> | EvaluateResolverResult<Resolvers['linkedItems'], LinkedItem>>;

const resolver: Resolver = null as any;
const a = resolver('', { assets: () => 'my asset', nativeNode: node => 8 });
