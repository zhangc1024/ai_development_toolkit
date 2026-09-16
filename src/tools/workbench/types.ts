import type { HmacOptions, HashOptions } from '../security/crypto'
import type { JwtResult } from '../security/jwt'
import type { SqlOptions } from '../sql/core'
export type WorkbenchKind = 'jwt' | 'hash' | 'hmac' | 'sql'
export interface WorkRequest { kind: WorkbenchKind; text: string; options: HashOptions & HmacOptions & SqlOptions }
export interface WorkResult { ok: boolean; message: string; output?: string; jwt?: JwtResult }
