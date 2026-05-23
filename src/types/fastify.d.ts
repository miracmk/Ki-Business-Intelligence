import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate:      (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireFullAccess: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    user?: {
      sub:      string
      tenantId: string
      role?:    string
      scope?:   string
    }
  }
}
