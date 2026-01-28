/*
|--------------------------------------------------------------------------
| App File Categories Registry
|--------------------------------------------------------------------------
|
| Defines how app files are categorized based on path patterns,
| along with display names and icons for each category.
|
*/

import type { AppFileCategory } from '../../types.js'
import { symbols } from './symbols.js'

export interface CategoryDefinition {
  displayName: string
  icon: string
  patterns: string[]
}

export const categories: Record<AppFileCategory, CategoryDefinition> = {
  controller: {
    displayName: 'Controllers',
    icon: symbols.controller,
    patterns: ['/controllers/', '_controller.'],
  },
  service: {
    displayName: 'Services',
    icon: symbols.service,
    patterns: ['/services/', '_service.'],
  },
  model: {
    displayName: 'Models',
    icon: symbols.model,
    patterns: ['/models/', '/model/'],
  },
  middleware: {
    displayName: 'Middleware',
    icon: symbols.middleware,
    patterns: ['/middleware/', '_middleware.'],
  },
  validator: {
    displayName: 'Validators',
    icon: symbols.validator,
    patterns: ['/validators/', '_validator.'],
  },
  exception: {
    displayName: 'Exceptions',
    icon: symbols.exception,
    patterns: ['/exceptions/', '_exception.'],
  },
  event: {
    displayName: 'Events',
    icon: symbols.event,
    patterns: ['/events/', '_event.'],
  },
  listener: {
    displayName: 'Listeners',
    icon: symbols.listener,
    patterns: ['/listeners/', '_listener.'],
  },
  mailer: {
    displayName: 'Mailers',
    icon: symbols.mailer,
    patterns: ['/mailers/', '_mailer.'],
  },
  policy: {
    displayName: 'Policies',
    icon: symbols.policy,
    patterns: ['/policies/', '_policy.'],
  },
  command: {
    displayName: 'Commands',
    icon: symbols.command,
    patterns: ['/commands/', '_command.'],
  },
  provider: {
    displayName: 'Providers',
    icon: symbols.provider,
    patterns: ['/providers/', '_provider.'],
  },
  config: {
    displayName: 'Config',
    icon: symbols.config,
    patterns: ['/config/'],
  },
  start: {
    displayName: 'Start Files',
    icon: symbols.start,
    patterns: ['/start/'],
  },
  other: {
    displayName: 'Other',
    icon: symbols.file,
    patterns: [],
  },
}
