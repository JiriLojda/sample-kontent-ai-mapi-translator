import { ContentTypeElements, ContentTypeModels, ManagementClient } from '@kontent-ai/management-sdk';

type ElementWithoutSnippet = Exclude<ContentTypeElements.ContentTypeElementModel, ContentTypeElements.ISnippetElement>;
type RemoveSnippetElements<T extends ContentTypeModels.ContentType> = Omit<T, 'elements'> & { elements: ReadonlyArray<ElementWithoutSnippet> };

export type NormalizedContentType = RemoveSnippetElements<ContentTypeModels.ContentType>;
export type NormalizedContentTypeElementType = ElementWithoutSnippet['type'];

export const loadContentTypes = (client: ManagementClient): Promise<ReadonlyArray<NormalizedContentType>> =>
  client
    .listContentTypes()
    .toAllPromise()
    .then(res => res.data.items)
    .then(types => Promise.all(types.map(async type => ({
      ...type,
      elements: await Promise.all(type.elements.map(el => el.type === 'snippet' ? loadSnippetElements(client, el.snippet.id || '') : Promise.resolve([el]))).then(res => res.flat()),
    }))));

const loadSnippetElements = (client: ManagementClient, snippetId: string): Promise<ReadonlyArray<ElementWithoutSnippet>> =>
  client
    .viewContentTypeSnippet()
    .byTypeId(snippetId)
    .toPromise()
    .then(res => res.data.elements.filter(isNotSnippetElement)) // Snippets cannot have snippet elements even though SDK types claim they can so this filter should filter anything in practice

const isNotSnippetElement = (element: ContentTypeElements.ContentTypeElementModel): element is ElementWithoutSnippet =>
  element.type !== 'snippet';
