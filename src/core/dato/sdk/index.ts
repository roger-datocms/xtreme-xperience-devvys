import type { AnyVariables } from '@urql/core'
import type { DocumentNode } from 'graphql'
import { initLogger, type Logger } from '../../logger'
import { type Client, createDatoClient } from '../client'
import { getDatoDebugSession } from '../debug'
import type { Requester } from './blueprint'
import { getSdk } from './blueprint'

const isAnyVariables = (input: unknown): input is AnyVariables => {
  return typeof input === 'object'
}

export type SdkOptions = {
  type?: 'mutation' | 'query'
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _makeSdk = (client: Client, _logger: Logger) => {
  const requester: Requester<SdkOptions> = async <R>(
    doc: DocumentNode,
    _variables?: unknown,
    options?: SdkOptions
  ): Promise<R> => {
    const type = options?.type || 'query'

    // TODO Review if this step is necessary
    const variables = isAnyVariables(_variables) ? _variables : {}

    // Optional DatoCMS debug panel; null unless DATOCMS_DEBUG_PANEL=true.
    const debug = getDatoDebugSession()
    const renderClient = debug?.client ?? client
    const operation =
      type === 'mutation'
        ? renderClient.mutation<R>(doc, variables, debug?.context).toPromise()
        : renderClient.query<R>(doc, variables, debug?.context).toPromise()

    const { data, error } = debug ? await debug.track(operation) : await operation

    if (error) {
      throw error
    }

    if (data == null) {
      throw new Error('No data presented in the GraphQL response')
    }

    return data
  }

  return getSdk<SdkOptions>(requester)
}

export type Sdk = ReturnType<typeof _makeSdk>

let sdk: Sdk | null = null

export const initDatoSdk = (): Sdk => {
  const logger = initLogger()
  sdk = sdk ?? _makeSdk(createDatoClient({ logger: logger }), logger)
  return sdk
}
